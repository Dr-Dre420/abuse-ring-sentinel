import os
import yaml
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def generate_entities(config):
    np.random.seed(config['seed'])
    
    # Customers
    num_cust = config['num_customers']
    customers = pd.DataFrame({
        'customer_id': [f"C{i}" for i in range(num_cust)],
        'created_at': [datetime.fromisoformat(config['start_date']) - timedelta(days=np.random.randint(1, 365)) for _ in range(num_cust)],
        'region': np.random.choice(['NA', 'EU', 'AS', 'SA'], num_cust),
        'baseline_rate': np.random.exponential(0.5, num_cust), # txns per day
        'baseline_ticket': np.random.lognormal(mean=3.0, sigma=1.0, size=num_cust)
    })
    
    # Merchants
    num_merch = config['num_merchants']
    merchants = pd.DataFrame({
        'merchant_id': [f"M{i}" for i in range(num_merch)],
        'category': np.random.choice(['digital', 'physical', 'services'], num_merch),
        'region': np.random.choice(['NA', 'EU', 'AS', 'SA'], num_merch),
        'baseline_volume': np.random.exponential(5.0, num_merch),
        'baseline_ticket': np.random.lognormal(mean=3.5, sigma=1.0, size=num_merch)
    })
    
    # Devices
    num_dev = config['num_devices']
    devices = pd.DataFrame({
        'device_id': [f"D{i}" for i in range(num_dev)],
        'device_age_days': np.random.randint(1, 1000, num_dev),
        'region': np.random.choice(['NA', 'EU', 'AS', 'SA'], num_dev)
    })
    
    # Payment Methods
    num_pms = config['num_pms']
    pms = pd.DataFrame({
        'pm_id': [f"P{i}" for i in range(num_pms)],
        'type': np.random.choice(['cc', 'dc', 'wallet', 'bank'], num_pms),
        'age_days': np.random.randint(1, 1000, num_pms)
    })
    
    return customers, merchants, devices, pms

def generate_background_transactions(config, customers, merchants, devices, pms, start_dt, end_dt):
    np.random.seed(config['seed'] + 1)
    
    total_days = (end_dt - start_dt).days
    target_txns = int(config['target_transactions'] * 0.9) # 90% background
    
    # Sample customers based on baseline rate
    probs = customers['baseline_rate'] / customers['baseline_rate'].sum()
    sampled_custs = np.random.choice(customers['customer_id'], size=target_txns, p=probs)
    
    # Random timestamps across the range
    seconds_in_range = int((end_dt - start_dt).total_seconds())
    random_seconds = np.random.randint(0, seconds_in_range, target_txns)
    timestamps = [start_dt + timedelta(seconds=int(s)) for s in random_seconds]
    
    # Sample merchants, devices, PMs (simple uniform for background)
    sampled_merchs = np.random.choice(merchants['merchant_id'], target_txns)
    sampled_devices = np.random.choice(devices['device_id'], target_txns)
    sampled_pms = np.random.choice(pms['pm_id'], target_txns)
    
    # Amounts based on merchant baseline
    # Vectorized amount generation
    m_tickets = merchants.set_index('merchant_id')['baseline_ticket']
    base_amts = m_tickets.loc[sampled_merchs].values
    amounts = np.random.lognormal(mean=np.log(base_amts), sigma=0.5)
    
    txns = pd.DataFrame({
        'ts': timestamps,
        'customer_id': sampled_custs,
        'merchant_id': sampled_merchs,
        'device_id': sampled_devices,
        'pm_id': sampled_pms,
        'amount': amounts,
        'status': np.random.choice(['success', 'failed'], target_txns, p=[0.9, 0.1]),
        'is_abuse': 0,
        'scenario_id': 'background'
    })
    
    return txns

def generate_scenarios(config, customers, merchants, devices, pms, splits, start_dt, end_dt):
    np.random.seed(config['seed'] + 2)
    
    scenario_txns = []
    scenario_metadata = []
    
    s_id = 0
    
    # Helper to generate bursts
    def _create_burst(name, start_t, end_t, num_txns, cust_pool, merch_pool, dev_pool, pm_pool, is_abuse):
        nonlocal s_id
        s_id += 1
        sid_str = f"S{s_id}_{name}"
        
        seconds = int((end_t - start_t).total_seconds())
        if seconds <= 0: seconds = 1
        ts_list = [start_t + timedelta(seconds=int(s)) for s in np.random.randint(0, seconds, num_txns)]
        
        c = np.random.choice(cust_pool, num_txns)
        m = np.random.choice(merch_pool, num_txns)
        d = np.random.choice(dev_pool, num_txns)
        p = np.random.choice(pm_pool, num_txns)
        
        # amounts
        m_tickets = merchants.set_index('merchant_id')['baseline_ticket']
        base_amts = m_tickets.loc[m].values
        amts = np.random.lognormal(mean=np.log(base_amts), sigma=0.2)
        
        df = pd.DataFrame({
            'ts': ts_list,
            'customer_id': c,
            'merchant_id': m,
            'device_id': d,
            'pm_id': p,
            'amount': amts,
            'status': np.random.choice(['success', 'failed'], num_txns, p=[0.8, 0.2]),
            'is_abuse': 1 if is_abuse else 0,
            'scenario_id': sid_str
        })
        
        meta = {
            'scenario_id': sid_str,
            'scenario_type': name,
            'start_ts': start_t,
            'end_ts': end_t,
            'positive_label': 1 if is_abuse else 0,
            'split': split_name
        }
        return df, meta
    
    for split_name, (sp_start, sp_end) in splits.items():
        # 1. Coordinated burst (Positive)
        for _ in range(3): # 3 per split
            b_start = sp_start + timedelta(days=np.random.randint(0, (sp_end - sp_start).days))
            b_end = b_start + timedelta(hours=1) # tight window
            
            c_pool = np.random.choice(customers['customer_id'], 20, replace=False)
            m_pool = np.random.choice(merchants['merchant_id'], 2, replace=False)
            d_pool = np.random.choice(devices['device_id'], 15, replace=False) # moderately shared infrastructure
            p_pool = np.random.choice(pms['pm_id'], 50, replace=False)
            
            df, meta = _create_burst('coordinated_burst', b_start, b_end, 150, c_pool, m_pool, d_pool, p_pool, True)
            scenario_txns.append(df)
            scenario_metadata.append(meta)
            
        # 2. Merchant-centered ring (Positive)
        for _ in range(2):
            ring_m_pool = np.random.choice(merchants['merchant_id'], 3, replace=False)
            ring_c_pool = np.random.choice(customers['customer_id'], 50, replace=False)
            ring_d_pool = np.random.choice(devices['device_id'], 30, replace=False)
            ring_p_pool = np.random.choice(pms['pm_id'], 80, replace=False)
            
            # multiple bursts over the split
            num_bursts = 4
            for b in range(num_bursts):
                b_start = sp_start + timedelta(days=np.random.randint(0, (sp_end - sp_start).days))
                b_end = b_start + timedelta(hours=3)
                
                # change participants slightly
                sub_c = np.random.choice(ring_c_pool, 15, replace=False)
                df, meta = _create_burst('merchant_ring', b_start, b_end, 80, sub_c, ring_m_pool, ring_d_pool, ring_p_pool, True)
                scenario_txns.append(df)
                scenario_metadata.append(meta)
                
        # 3. Seasonal legitimate burst (Negative)
        for _ in range(2):
            b_start = sp_start + timedelta(days=np.random.randint(0, (sp_end - sp_start).days))
            b_end = b_start + timedelta(days=2) # longer window, weekend sale etc
            
            # Medium diversity (forces some natural collision)
            c_pool = np.random.choice(customers['customer_id'], 300, replace=False)
            m_pool = np.random.choice(merchants['merchant_id'], 10, replace=False)
            d_pool = np.random.choice(devices['device_id'], 200, replace=False)
            p_pool = np.random.choice(pms['pm_id'], 250, replace=False)
            
            df, meta = _create_burst('seasonal_burst', b_start, b_end, 500, c_pool, m_pool, d_pool, p_pool, False)
            scenario_txns.append(df)
            scenario_metadata.append(meta)
            
    return pd.concat(scenario_txns, ignore_index=True), pd.DataFrame(scenario_metadata)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_dir, 'configs', 'data.yaml')
    config = load_config(config_path)
    
    start_dt = datetime.fromisoformat(config['start_date'])
    end_dt = datetime.fromisoformat(config['end_date'])
    
    # Calculate splits
    total_days = (end_dt - start_dt).days
    train_end = start_dt + timedelta(days=int(total_days * config['train_ratio']))
    val_end = train_end + timedelta(days=int(total_days * config['val_ratio']))
    
    splits = {
        'train': (start_dt, train_end),
        'val': (train_end, val_end),
        'test': (val_end, end_dt)
    }
    
    print("Generating entities...")
    cust, merch, dev, pms = generate_entities(config)
    
    print("Generating background transactions...")
    bg_txns = generate_background_transactions(config, cust, merch, dev, pms, start_dt, end_dt)
    
    print("Generating scenarios...")
    sc_txns, sc_meta = generate_scenarios(config, cust, merch, dev, pms, splits, start_dt, end_dt)
    
    # Combine
    all_txns = pd.concat([bg_txns, sc_txns], ignore_index=True)
    
    # Assign txn_id and sort
    all_txns = all_txns.sort_values('ts').reset_index(drop=True)
    all_txns['txn_id'] = [f"T{i}" for i in range(len(all_txns))]
    
    # Assign splits explicitly based on strictly timestamp
    def get_split(ts):
        if ts < train_end: return 'train'
        elif ts < val_end: return 'val'
        else: return 'test'
        
    all_txns['split'] = all_txns['ts'].apply(get_split)
    
    # Reorder columns
    cols = ['txn_id', 'ts', 'customer_id', 'merchant_id', 'device_id', 'pm_id', 'amount', 'status', 'is_abuse', 'scenario_id', 'split']
    all_txns = all_txns[cols]
    
    out_dir = os.path.join(base_dir, 'artifacts', 'data')
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"Saving {len(all_txns)} transactions to {out_dir}")
    
    # Drop scenario_id for strict leakage safety in final dataset if desired, but we need it for metadata mapping.
    # The specification says "Scenario metadata: scenario_id... Evaluation only; never a model feature"
    # We will keep it in the CSV but our feature pipeline will ignore it.
    all_txns.to_csv(os.path.join(out_dir, 'transactions.csv'), index=False)
    sc_meta.to_csv(os.path.join(out_dir, 'scenario_manifest.csv'), index=False)
    
    print("Splits distribution:")
    print(all_txns['split'].value_counts(normalize=True))
    
    print("Positive rate:")
    print(all_txns['is_abuse'].value_counts(normalize=True))

if __name__ == "__main__":
    main()
