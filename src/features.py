import os
import yaml
import pandas as pd
import numpy as np
from datetime import timedelta
import networkx as nx
from collections import deque

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def compute_temporal_features(df):
    df = df.copy()
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.sort_values('ts').reset_index(drop=True)
    
    print("Computing customer-level temporal features...")
    
    # ---------------------------------------------------------
    # Efficient Leakage-Safe Feature Computation
    #
    # TEMPORAL HISTORY ACROSS SPLITS:
    # This pipeline strictly processes transactions in time order across the
    # entire dataset. Rolling histories do NOT reset at split boundaries.
    # Therefore, valid information flow is maintained:
    # - TRAIN HISTORY -> VALIDATION
    # - TRAIN + VALIDATION HISTORY -> TEST
    # Future timestamps never influence earlier predictions.
    # ---------------------------------------------------------
    
    df_cust = df.sort_values(['customer_id', 'ts']).copy()
    
    # time_since_last_txn
    df_cust['time_since_last_txn'] = df_cust.groupby('customer_id')['ts'].diff().dt.total_seconds().fillna(999999)
    
    # burst_score = 1.0 / (log(time_since_last_txn + 2))
    df_cust['burst_score'] = 1.0 / np.log(df_cust['time_since_last_txn'] + 2.0)
    
    # historical customer median amount
    # expanding window, shift by 1 to exclude current row
    df_cust['hist_median_amt'] = df_cust.groupby('customer_id')['amount'].apply(lambda x: x.expanding().median().shift(1)).reset_index(level=0, drop=True)
    df_cust['amount_ratio_vs_customer'] = df_cust['amount'] / (df_cust['hist_median_amt'] + 1e-5)
    df_cust['amount_ratio_vs_customer'] = df_cust['amount_ratio_vs_customer'].fillna(1.0)
    
    # Merge the fast grouped ones back to main df using original index
    df['time_since_last_txn'] = df_cust['time_since_last_txn']
    df['burst_score'] = df_cust['burst_score']
    df['amount_ratio_vs_customer'] = df_cust['amount_ratio_vs_customer']
    
    # Custom exact rolling to avoid pandas grouped rolling bugs on duplicates
    print("Computing rolling window features exactly...")
    records = df.to_dict('records')
    
    # Dictionaries to track history
    from collections import defaultdict
    cust_history = defaultdict(list)
    merch_history = defaultdict(list)
    
    txn_count_5m_list = []
    txn_count_1h_list = []
    unique_merch_1h_list = []
    merchant_vel_1h_list = []
    new_device_24h_list = []
    
    for row in records:
        ts = row['ts']
        cid = row['customer_id']
        mid = row['merchant_id']
        did = row['device_id']
        
        c_hist = cust_history[cid]
        m_hist = merch_history[mid]
        
        # filters
        cutoff_5m = ts - timedelta(minutes=5)
        cutoff_1h = ts - timedelta(hours=1)
        cutoff_24h = ts - timedelta(hours=24)
        
        # CUST 5m count
        count_5m = sum(1 for h in c_hist if h['ts'] >= cutoff_5m and h['ts'] < ts)
        txn_count_5m_list.append(count_5m)
        
        # CUST 1h count
        count_1h = sum(1 for h in c_hist if h['ts'] >= cutoff_1h and h['ts'] < ts)
        txn_count_1h_list.append(count_1h)
        
        # CUST unique merchants 1h
        merchs_1h = set(h['merchant_id'] for h in c_hist if h['ts'] >= cutoff_1h and h['ts'] < ts)
        unique_merch_1h_list.append(len(merchs_1h))
        
        # NEW device 24h
        devices_24h = set(h['device_id'] for h in c_hist if h['ts'] >= cutoff_24h and h['ts'] < ts)
        new_device_24h_list.append(1 if did not in devices_24h else 0)
        
        # MERCH 1h velocity
        m_count_1h = sum(1 for h in m_hist if h['ts'] >= cutoff_1h and h['ts'] < ts)
        merchant_vel_1h_list.append(m_count_1h)
        
        # append to history
        cust_history[cid].append(row)
        merch_history[mid].append(row)
        
    df['txn_count_5m'] = txn_count_5m_list
    df['txn_count_1h'] = txn_count_1h_list
    df['unique_merchants_1h'] = unique_merch_1h_list
    df['new_device_24h'] = new_device_24h_list
    df['merchant_velocity_1h'] = merchant_vel_1h_list
    
    # Merge the fast grouped ones (already done above at line 37)
    
    return df

def compute_graph_features(df):
    df = df.copy()
    print("Computing graph features (24h window)...")
    
    records = df.to_dict('records')
    
    # We will use a sliding window of (timestamp, C, M, D, P)
    window = deque()
    
    G = nx.Graph()
    
    def add_txn(c, m, d, p):
        for v in [m, d, p]:
            if G.has_edge(c, v):
                G[c][v]['weight'] += 1
            else:
                G.add_edge(c, v, weight=1)
                
    def remove_txn(c, m, d, p):
        for v in [m, d, p]:
            G[c][v]['weight'] -= 1
            if G[c][v]['weight'] == 0:
                G.remove_edge(c, v)
                # optionally remove isolated nodes, but not strictly necessary for this computation
                
    f_customer_degree = []
    f_shared_device_customers = []
    f_shared_pm_customers = []
    f_two_hop_customer_count = []
    f_local_cluster_density = []
    
    for row in records:
        ts = row['ts']
        cid = row['customer_id']
        mid = row['merchant_id']
        did = row['device_id']
        pid = row['pm_id']
        
        cutoff_24h = ts - timedelta(hours=24)
        
        # Prune window
        while window and window[0]['ts'] < cutoff_24h:
            old_row = window.popleft()
            remove_txn(old_row['c'], old_row['m'], old_row['d'], old_row['p'])
            
        # ---------------------------------------------------------------------
        # CAUSAL OBSERVATION SEMANTICS:
        # 1. Graph features are computed strictly from historical graph state
        #    BEFORE committing the current transaction's edges (zero-second lookahead).
        # 2. Same-timestamp transactions are ordered deterministically by arrival
        #    order (stream tie-breaker), preserving real-time causal sequence.
        # 3. Prospective entity inclusion: We query whether the current transaction's
        #    entity (did, pid) was already active among other accounts in the historical
        #    window, without committing current edges prior to evaluation.
        # ---------------------------------------------------------------------
        
        # 1. customer_degree_24h (strictly historical)
        f_customer_degree.append(G.degree(cid) if cid in G else 0)
        
        # 2. shared_device_customers_24h (prospective device check against historical neighbors)
        shared_devices = set([n for n in G.neighbors(cid) if str(n).startswith('D')] if cid in G else [])
        shared_devices.add(did)
        shared_d_custs = set()
        for d in shared_devices:
            if d in G:
                shared_d_custs.update(n for n in G.neighbors(d) if str(n).startswith('C') and n != cid)
        f_shared_device_customers.append(len(shared_d_custs))
        
        # 3. shared_pm_customers_24h
        shared_pms = set([n for n in G.neighbors(cid) if str(n).startswith('P')] if cid in G else [])
        shared_pms.add(pid)
        shared_p_custs = set()
        for p in shared_pms:
            if p in G:
                shared_p_custs.update(n for n in G.neighbors(p) if str(n).startswith('C') and n != cid)
        f_shared_pm_customers.append(len(shared_p_custs))
        
        # 4. two_hop_customer_count_24h
        two_hop_custs = set()
        # Historical neighbors
        if cid in G:
            for n in G.neighbors(cid):
                two_hop_custs.update(nbr for nbr in G.neighbors(n) if str(nbr).startswith('C') and nbr != cid)
        # Plus current transaction entities
        for n in [did, pid, mid]:
            if n in G:
                two_hop_custs.update(nbr for nbr in G.neighbors(n) if str(nbr).startswith('C') and nbr != cid)
        f_two_hop_customer_count.append(len(two_hop_custs))
        
        # 5. local_cluster_density_24h
        c_set = {cid} | two_hop_custs
        e_set = set()
        for c_node in c_set:
            if c_node in G:
                e_set.update(G.neighbors(c_node))
                
        possible_edges = len(c_set) * len(e_set)
        if possible_edges == 0:
            f_local_cluster_density.append(0.0)
        else:
            actual_edges = sum(G.degree(c_node) for c_node in c_set if c_node in G)
            f_local_cluster_density.append(actual_edges / possible_edges)
            
        # Officially add current txn to window and graph
        window.append({'ts': ts, 'c': cid, 'm': mid, 'd': did, 'p': pid})
        add_txn(cid, mid, did, pid)
        
    df['customer_degree_24h'] = f_customer_degree
    df['shared_device_customers_24h'] = f_shared_device_customers
    df['shared_pm_customers_24h'] = f_shared_pm_customers
    df['two_hop_customer_count_24h'] = f_two_hop_customer_count
    df['local_cluster_density_24h'] = f_local_cluster_density
    
    return df


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config = load_config(os.path.join(base_dir, 'configs', 'data.yaml'))
    
    data_dir = os.path.join(base_dir, 'artifacts', 'data')
    txns_path = os.path.join(data_dir, 'transactions.csv')
    
    print(f"Loading {txns_path}...")
    df = pd.read_csv(txns_path)
    
    print("Extracting features...")
    df_feat = compute_temporal_features(df)
    
    print("Extracting graph features...")
    df_feat = compute_graph_features(df_feat)
    
    out_path = os.path.join(data_dir, 'features.csv')
    df_feat.to_csv(out_path, index=False)
    print(f"Saved features to {out_path}")

if __name__ == "__main__":
    main()
