import os
import yaml
import pickle
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.metrics import precision_recall_curve, confusion_matrix, auc, precision_score, recall_score, f1_score

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'artifacts', 'data')
MODEL_DIR = os.path.join(BASE_DIR, 'artifacts', 'models')

# Cache datasets and models
_CACHE = {}

def get_resources():
    if 'df' not in _CACHE:
        features_path = os.path.join(DATA_DIR, 'features.csv')
        df = pd.read_csv(features_path)
        df['ts'] = pd.to_datetime(df['ts'])
        _CACHE['df'] = df

        with open(os.path.join(MODEL_DIR, 'xgboost_graph.pkl'), 'rb') as f:
            _CACHE['model_B'] = pickle.load(f)

        with open(os.path.join(MODEL_DIR, 'xgboost_temporal.pkl'), 'rb') as f:
            _CACHE['model_C'] = pickle.load(f)

    return _CACHE['df'], _CACHE['model_B'], _CACHE['model_C']


DEMO_CASE_IDS = {
    "A": "T57997",  # Coordinated burst abuse (High risk, shared device & PM)
    "B": "T59899",  # Merchant ring abuse (High risk, dense merchant-centered network)
    "C": "T60698",  # Seasonal burst legitimate (Model C FP, Model B correctly cleared as TN)
}

DEMO_METADATA = {
    "T57997": {
        "demo_type": "Case A: Coordinated Burst Abuse",
        "description": "High-velocity coordinated transaction surge across a shared device and payment infrastructure. Both temporal velocity and relational graph indicate coordinated abuse.",
        "intended_lesson": "Demonstrates detection of rapid coordinated account pooling across shared infrastructure."
    },
    "T59899": {
        "demo_type": "Case B: Merchant-Ring Abuse",
        "description": "Merchant-centered collusion ring where synthetic accounts funnel payments into a small cluster of colluding merchants using heavily recycled devices.",
        "intended_lesson": "Demonstrates identification of merchant-centered multi-hop collusion rings."
    },
    "T60698": {
        "demo_type": "Case C: Legitimate Seasonal Burst",
        "description": "Organic holiday sales volume burst at a popular merchant. Temporal velocity alone triggers a false alarm in Model C, but graph relational context shows dispersed, organic users and low cluster density, enabling Model B to safely clear the transaction.",
        "intended_lesson": "Demonstrates why relational context reduces costly false positives during high-velocity sales events."
    }
}


def get_deterministic_reasons(row):
    """
    Generate deterministic, evidence-grounded risk reasons strictly
    based on observable feature values. No hallucinations.
    """
    reasons = []

    # 1. Merchant velocity
    m_vel = row.get('merchant_velocity_1h', 0)
    if m_vel >= 25:
        reasons.append({
            "code": "CRITICAL_MERCHANT_VELOCITY",
            "title": "Critical Merchant Surge",
            "detail": f"Merchant volume surged to {int(m_vel)} transactions in past 1h (benchmark normal < 5).",
            "severity": "high"
        })
    elif m_vel >= 10:
        reasons.append({
            "code": "ELEVATED_MERCHANT_VELOCITY",
            "title": "Elevated Merchant Velocity",
            "detail": f"Merchant recorded {int(m_vel)} transactions in past 1h.",
            "severity": "medium"
        })

    # 2. Shared device
    shared_dev = row.get('shared_device_customers_24h', 0)
    if shared_dev >= 10:
        reasons.append({
            "code": "EXTREME_DEVICE_SHARING",
            "title": "Severe Device Multiplexing",
            "detail": f"Device {row.get('device_id')} was utilized by {int(shared_dev)} different customer accounts in 24h.",
            "severity": "high"
        })
    elif shared_dev >= 3:
        reasons.append({
            "code": "SHARED_DEVICE_EXPOSURE",
            "title": "Shared Device Detected",
            "detail": f"Device shared with {int(shared_dev)} other customers in the past 24h.",
            "severity": "medium"
        })

    # 3. Shared PM
    shared_pm = row.get('shared_pm_customers_24h', 0)
    if shared_pm >= 10:
        reasons.append({
            "code": "EXTREME_PM_SHARING",
            "title": "High Payment Instrument Sharing",
            "detail": f"Payment method {row.get('pm_id')} linked to {int(shared_pm)} distinct customers in 24h.",
            "severity": "high"
        })
    elif shared_pm >= 3:
        reasons.append({
            "code": "SHARED_PM_EXPOSURE",
            "title": "Shared Payment Method",
            "detail": f"Payment credential used across {int(shared_pm)} customer accounts in 24h.",
            "severity": "medium"
        })

    # 4. Extended 2-hop cluster
    two_hop = row.get('two_hop_customer_count_24h', 0)
    if two_hop >= 20:
        reasons.append({
            "code": "DENSE_COLLUSION_RING",
            "title": "Dense Collusion Ring Topology",
            "detail": f"Customer reachable to {int(two_hop)} other customers in exactly 2 bipartite graph hops.",
            "severity": "high"
        })
    elif two_hop >= 8:
        reasons.append({
            "code": "CONNECTED_NEIGHBORHOOD",
            "title": "Interconnected Customer Network",
            "detail": f"Customer connects to {int(two_hop)} accounts via shared infrastructure.",
            "severity": "medium"
        })

    # 5. Burst score / transaction count
    burst = row.get('burst_score', 0)
    count_5m = row.get('txn_count_5m', 0)
    if burst >= 0.15 or count_5m >= 3:
        reasons.append({
            "code": "HIGH_FREQUENCY_BURST",
            "title": "Rapid Transaction Cadence",
            "detail": f"Customer initiated {int(count_5m)} transactions in 5 minutes (burst score: {burst:.3f}).",
            "severity": "medium"
        })

    # 6. Local cluster density
    density = row.get('local_cluster_density_24h', 0)
    if density >= 0.1:
        reasons.append({
            "code": "HIGH_LOCAL_DENSITY",
            "title": "Tight Local Graph Interlocking",
            "detail": f"Bipartite subgraph density is {density:.3f}, indicating coordinated cross-linking.",
            "severity": "medium"
        })

    if not reasons:
        reasons.append({
            "code": "ORGANIC_BASELINE",
            "title": "Conforms to Normal Organic Profile",
            "detail": "No anomalous velocity spikes or suspicious entity multiplexing detected within the causal 24h window.",
            "severity": "info"
        })

    return reasons


def get_defensive_recommendation(prob_B, threshold_B, row):
    """
    Deterministic, reversible defensive action policy.
    Never offensive or irreversible. No financial action is executed automatically.
    """
    shared_dev = row.get('shared_device_customers_24h', 0)
    shared_pm = row.get('shared_pm_customers_24h', 0)
    m_vel = row.get('merchant_velocity_1h', 0)

    if prob_B >= 0.70 or (prob_B >= threshold_B and (shared_dev >= 10 or shared_pm >= 10 or m_vel >= 25)):
        return {
            "action": "Escalate for analyst authorization",
            "level": "critical",
            "guidance": "Escalate for analyst authorization: Route immediately to Tier-2 Abuse Ring Specialist. Recommend temporary 2-hour settlement hold on high-velocity merchant payouts pending ring topology verification. No financial action is executed automatically.",
            "reversible": True
        }
    elif prob_B >= threshold_B:
        return {
            "action": "Analyst review",
            "level": "warning",
            "guidance": "Route transaction to human risk queue for standard verification. Prompt user for step-up biometric/3DS verification on subsequent transactions.",
            "reversible": True
        }
    else:
        return {
            "action": "Monitor",
            "level": "success",
            "guidance": "Allow transaction to complete normally. Retain transaction telemetry in the sliding 24-hour causal graph window for ongoing risk tracking.",
            "reversible": True
        }


def extract_causal_neighborhood(df, focal_row, max_neighbors=25):
    """
    Extract readable ego-network centered on the focal transaction.
    Uses strictly the causal 24h window [t - 24h, t].
    Avoids visual clutter by limiting secondary neighbors.
    """
    ts = focal_row['ts']
    cutoff_24h = ts - timedelta(hours=24)

    # Filter transactions in strictly causal 24h window up to current event
    window_df = df[(df['ts'] >= cutoff_24h) & (df['ts'] <= ts)].copy()

    focal_cid = focal_row['customer_id']
    focal_mid = focal_row['merchant_id']
    focal_did = focal_row['device_id']
    focal_pid = focal_row['pm_id']

    nodes = {}
    edges = set()

    # Add core nodes
    nodes[focal_cid] = {"id": focal_cid, "label": focal_cid, "type": "customer", "is_focal": True}
    nodes[focal_mid] = {"id": focal_mid, "label": focal_mid, "type": "merchant", "is_focal": False}
    nodes[focal_did] = {"id": focal_did, "label": focal_did, "type": "device", "is_focal": False}
    nodes[focal_pid] = {"id": focal_pid, "label": focal_pid, "type": "pm", "is_focal": False}

    # Core edges
    edges.add((focal_cid, focal_mid, "transacted_at"))
    edges.add((focal_cid, focal_did, "used_device"))
    edges.add((focal_cid, focal_pid, "used_pm"))

    # Find other transactions sharing the device, PM, or merchant within window
    related_txns = window_df[
        (window_df['device_id'] == focal_did) |
        (window_df['pm_id'] == focal_pid) |
        ((window_df['merchant_id'] == focal_mid) & (window_df['customer_id'] != focal_cid))
    ]

    added_customers = set()
    for _, r in related_txns.iterrows():
        cid = r['customer_id']
        mid = r['merchant_id']
        did = r['device_id']
        pid = r['pm_id']

        if cid not in nodes:
            if len(nodes) >= max_neighbors:
                break
            nodes[cid] = {"id": cid, "label": cid, "type": "customer", "is_focal": False}
            added_customers.add(cid)

        if did == focal_did:
            edges.add((cid, focal_did, "shared_device"))
        if pid == focal_pid:
            edges.add((cid, focal_pid, "shared_pm"))
        if mid == focal_mid and cid in added_customers and len(edges) < 40:
            edges.add((cid, focal_mid, "transacted_at"))

    # Convert edges to list of dicts
    edges_list = [{"source": u, "target": v, "relation": rel} for (u, v, rel) in edges]
    nodes_list = list(nodes.values())

    return {
        "nodes": nodes_list,
        "edges": edges_list,
        "window_start": cutoff_24h.isoformat(),
        "window_end": ts.isoformat(),
        "total_window_txns": len(window_df)
    }


def compute_investigation_timeline(df, row):
    """
    Construct a static, deterministic 24-hour pre-event investigation timeline
    derived strictly from actual historical window events [t - 24h, t].
    No animation, no simulated playback.
    """
    ts = row['ts']
    mid = row['merchant_id']
    did = row['device_id']
    
    t_minus_24 = ts - timedelta(hours=24)
    t_minus_12 = ts - timedelta(hours=12)
    t_minus_6  = ts - timedelta(hours=6)
    t_minus_1  = ts - timedelta(hours=1)
    
    w_df = df[(df['ts'] >= t_minus_24) & (df['ts'] <= ts)]
    
    m_w1 = w_df[(w_df['ts'] < t_minus_12) & (w_df['merchant_id'] == mid)]
    m_w2 = w_df[(w_df['ts'] >= t_minus_12) & (w_df['ts'] < t_minus_6) & (w_df['merchant_id'] == mid)]
    m_w3 = w_df[(w_df['ts'] >= t_minus_6) & (w_df['ts'] < t_minus_1) & (w_df['merchant_id'] == mid)]
    m_w4 = w_df[(w_df['ts'] >= t_minus_1) & (w_df['merchant_id'] == mid)]
    
    d_early = w_df[(w_df['ts'] < t_minus_6) & (w_df['device_id'] == did)]['customer_id'].nunique()
    d_recent = w_df[(w_df['ts'] >= t_minus_6) & (w_df['device_id'] == did)]['customer_id'].nunique()
    
    timeline = [
        {
            "offset": "T - 24h",
            "time": t_minus_24.strftime("%H:%M:%S"),
            "date": t_minus_24.strftime("%b %d"),
            "title": "Causal Window Opens",
            "detail": f"Sliding 24h observation window opens. Ambient activity: {len(m_w1)} transactions at merchant {mid}.",
            "status": "info"
        },
        {
            "offset": "T - 12h",
            "time": t_minus_12.strftime("%H:%M:%S"),
            "date": t_minus_12.strftime("%b %d"),
            "title": "Mid-Window Telemetry",
            "detail": f"Recorded {len(m_w2)} merchant transactions. Early device reuse: {d_early} accounts.",
            "status": "info"
        },
        {
            "offset": "T - 6h",
            "time": t_minus_6.strftime("%H:%M:%S"),
            "date": t_minus_6.strftime("%b %d"),
            "title": "Pre-Event Trajectory",
            "detail": f"Velocity at merchant {mid}: {len(m_w3)} transactions across preceding 5h window.",
            "status": "warning" if len(m_w3) >= 10 else "info"
        },
        {
            "offset": "T - 1h",
            "time": t_minus_1.strftime("%H:%M:%S"),
            "date": t_minus_1.strftime("%b %d"),
            "title": "1-Hour Velocity Surge" if len(m_w4) >= 10 else "Immediate 1h Cadence",
            "detail": f"Merchant volume reached {len(m_w4)} txns/hr. Active device accounts: {d_recent}.",
            "status": "danger" if len(m_w4) >= 20 else ("warning" if len(m_w4) >= 5 else "info")
        },
        {
            "offset": "T0",
            "time": ts.strftime("%H:%M:%S"),
            "date": ts.strftime("%b %d"),
            "title": "Transaction Evaluated",
            "detail": f"Transaction {row['txn_id']} scored by Dual Models. Graph & temporal features evaluated.",
            "status": "danger" if row.get('is_abuse', 0) == 1 else "success"
        }
    ]
    return timeline


def get_case_details(txn_id):
    """
    Comprehensive case details for the Case Investigator view.
    """
    df, model_B, model_C = get_resources()

    matching = df[df['txn_id'] == txn_id]
    if len(matching) == 0:
        return None

    row = matching.iloc[0]

    # Predict Model B (Graph enhanced)
    features_B = model_B['features']
    x_b = row[features_B].fillna(0).values.reshape(1, -1)
    prob_B = float(model_B['model'].predict_proba(x_b)[0, 1])
    thresh_B = float(model_B['threshold'])
    pred_B = int(prob_B >= thresh_B)

    # Predict Model C (Temporal only)
    features_C = model_C['features']
    x_c = row[features_C].fillna(0).values.reshape(1, -1)
    prob_C = float(model_C['model'].predict_proba(x_c)[0, 1])
    thresh_C = float(model_C['threshold'])
    pred_C = int(prob_C >= thresh_C)

    # Deterministic reasons & recommendations
    reasons = get_deterministic_reasons(row)
    recommendation = get_defensive_recommendation(prob_B, thresh_B, row)

    # Ego-network graph & static timeline
    graph_data = extract_causal_neighborhood(df, row)
    timeline_data = compute_investigation_timeline(df, row)

    # Metadata & labels
    demo_info = DEMO_METADATA.get(txn_id, {
        "demo_type": "Ad-Hoc Transaction Case",
        "description": "Arbitrary transaction queried from evaluation dataset.",
        "intended_lesson": "Evaluation of live or archived transaction."
    })

    return {
        "txn_id": txn_id,
        "ts": row['ts'].isoformat(),
        "customer_id": row['customer_id'],
        "merchant_id": row['merchant_id'],
        "device_id": row['device_id'],
        "pm_id": row['pm_id'],
        "amount": float(row['amount']),
        "split": row.get('split', 'test'),
        "scenario_id": row.get('scenario_id', 'unknown'),
        "is_abuse_ground_truth": int(row.get('is_abuse', 0)),

        "model_B": {
            "name": "XGBoost + Temporal + Graph",
            "risk_score": prob_B,
            "threshold": thresh_B,
            "decision": "Flagged (Abuse)" if pred_B == 1 else "Cleared (Legitimate)",
            "prediction": pred_B
        },
        "model_C": {
            "name": "XGBoost + Temporal Only",
            "risk_score": prob_C,
            "threshold": thresh_C,
            "decision": "Flagged (Abuse)" if pred_C == 1 else "Cleared (Legitimate)",
            "prediction": pred_C
        },

        "delta_analysis": {
            "score_diff": round(prob_B - prob_C, 4),
            "graph_impact": "Suppressed False Alarm" if (pred_C == 1 and pred_B == 0 and row['is_abuse'] == 0)
                            else ("Detected Coordinated Abuse" if (pred_B == 1 and row['is_abuse'] == 1)
                            else "Agreement"),
            "explanation": (
                "The temporal model detected an unusual burst. Relational features showed the activity was broadly distributed rather than concentrated within a suspicious connected network, assigning lower risk under relational context."
                if (pred_C == 1 and pred_B == 0 and row['is_abuse'] == 0)
                else ("High velocity and dense entity multiplexing mutually reinforced risk score under relational context."
                if (pred_B == 1 and pred_C == 1)
                else "Model B and Model C are in directional agreement.")
            )
        },

        "features": {f: (float(row[f]) if isinstance(row[f], (int, float, np.number)) else str(row[f]))
                     for f in (features_B + ['scenario_id']) if f in row},

        "reasons": reasons,
        "recommendation": recommendation,
        "graph": graph_data,
        "timeline": timeline_data,
        "demo_info": demo_info
    }


def score_batch(items):
    """
    Score a batch of transactions using Model B and Model C.
    items: list of dicts with feature values.
    """
    _, model_B, model_C = get_resources()
    features_B = model_B['features']
    features_C = model_C['features']

    results = []
    for item in items:
        # Prepare vector B
        vals_B = [float(item.get(f, 0.0) or 0.0) for f in features_B]
        prob_B = float(model_B['model'].predict_proba([vals_B])[0, 1])
        pred_B = int(prob_B >= model_B['threshold'])

        # Prepare vector C
        vals_C = [float(item.get(f, 0.0) or 0.0) for f in features_C]
        prob_C = float(model_C['model'].predict_proba([vals_C])[0, 1])
        pred_C = int(prob_C >= model_C['threshold'])

        reasons = get_deterministic_reasons(item)
        recommendation = get_defensive_recommendation(prob_B, model_B['threshold'], item)

        results.append({
            "txn_id": str(item.get("txn_id", "UNKNOWN")),
            "risk_score_graph": float(prob_B),
            "threshold_graph": float(model_B['threshold']),
            "flagged_graph": int(pred_B),
            "risk_score_temporal": float(prob_C),
            "threshold_temporal": float(model_C['threshold']),
            "flagged_temporal": int(pred_C),
            "reasons": reasons,
            "recommendation": recommendation
        })

    return results


def get_evaluation_summary():
    """
    Returns full evaluation metrics matching P1.7 frozen results:
    - Multi-seed aggregate metrics (mean across seeds)
    - Seed sensitivity (Seeds 42, 100, 999)
    - Held-out test Precision-Recall curves (Model B vs Model C)
    - Held-out Confusion Matrices
    - Scenario-Level performance breakdown
    - Cost comparison
    """
    df, model_B, model_C = get_resources()
    df_test = df[df['split'] == 'test'].copy()

    X_test_B = df_test[model_B['features']].fillna(0)
    X_test_C = df_test[model_C['features']].fillna(0)
    y_test = df_test['is_abuse']

    probs_B = model_B['model'].predict_proba(X_test_B)[:, 1]
    probs_C = model_C['model'].predict_proba(X_test_C)[:, 1]

    preds_B = (probs_B >= model_B['threshold']).astype(int)
    preds_C = (probs_C >= model_C['threshold']).astype(int)

    tn_B, fp_B, fn_B, tp_B = confusion_matrix(y_test, preds_B).ravel()
    tn_C, fp_C, fn_C, tp_C = confusion_matrix(y_test, preds_C).ravel()

    # Calculate PR curve
    p_b, r_b, _ = precision_recall_curve(y_test, probs_B)
    p_c, r_c, _ = precision_recall_curve(y_test, probs_C)

    # Downsample PR curve to 30 readable points for charting
    idx_b = np.linspace(0, len(r_b) - 1, 30, dtype=int)
    idx_c = np.linspace(0, len(r_c) - 1, 30, dtype=int)

    pr_curve_B = [{"recall": round(float(r_b[i]), 4), "precision": round(float(p_b[i]), 4)} for i in idx_b]
    pr_curve_C = [{"recall": round(float(r_c[i]), 4), "precision": round(float(p_c[i]), 4)} for i in idx_c]

    # Load scientific evaluation static summary
    import json
    static_metrics_path = os.path.join(BASE_DIR, 'artifacts', 'evaluation', 'dashboard_static_metrics.json')
    with open(static_metrics_path, 'r') as f:
        static_metrics = json.load(f)

    # Combine dynamic computations with static multi-seed averages
    return {
        "framing": static_metrics["framing"],
        "aggregate_comparison": static_metrics["aggregate_comparison"],
        "seed_sensitivity": static_metrics["seed_sensitivity"],
        
        "held_out_confusion_matrices": {
            "model_B": {
                "tn": int(tn_B),
                "fp": int(fp_B),
                "fn": int(fn_B),
                "tp": int(tp_B),
                "threshold": round(float(model_B['threshold']), 4),
                "cost": int(10 * fp_B + 500 * fn_B)
            },
            "model_C": {
                "tn": int(tn_C),
                "fp": int(fp_C),
                "fn": int(fn_C),
                "tp": int(tp_C),
                "threshold": round(float(model_C['threshold']), 4),
                "cost": int(10 * fp_C + 500 * fn_C)
            }
        },

        "pr_curves": {
            "model_B": pr_curve_B,
            "model_C": pr_curve_C
        },

        "scenario_performance": static_metrics["scenario_performance"],
        "feature_importance": static_metrics["feature_importance"]
    }
