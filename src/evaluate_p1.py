import os
import yaml
import pickle
import pandas as pd
import numpy as np
from sklearn.metrics import precision_score, recall_score, f1_score, precision_recall_curve, auc, confusion_matrix
import json

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def calculate_expected_cost(y_true, y_pred, C_FP=10, C_FN=500):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return C_FP * fp + C_FN * fn

def evaluate_model(model_artifact, df_test, target_col):
    model = model_artifact['model']
    features = model_artifact['features']
    scaler = model_artifact.get('scaler')
    threshold = model_artifact['threshold']
    
    X_test = df_test[features].fillna(0)
    y_test = df_test[target_col]
    
    if scaler:
        X_test = scaler.transform(X_test)
        
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)
    
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    
    precisions, recalls, _ = precision_recall_curve(y_test, y_prob)
    pr_auc = auc(recalls, precisions)
    
    metrics = {
        'precision': precision_score(y_test, y_pred, zero_division=0),
        'recall': recall_score(y_test, y_pred, zero_division=0),
        'f1': f1_score(y_test, y_pred, zero_division=0),
        'pr_auc': pr_auc,
        'fpr': fp / (fp + tn) if (fp + tn) > 0 else 0,
        'cost': calculate_expected_cost(y_test, y_pred),
        'confusion_matrix': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
    }
    return metrics, y_pred, y_prob

def analyze_scenarios(df_test, y_pred_A, y_pred_B):
    df = df_test.copy()
    df['pred_A'] = y_pred_A
    df['pred_B'] = y_pred_B
    
    # We map scenario_id to scenario family by removing the prefix 'S1_', 'S2_' etc.
    # From data.py: f"S{s_id}_{name}"
    def get_scenario_family(sid):
        if pd.isna(sid) or sid == 'background':
            return 'background'
        parts = sid.split('_', 1)
        if len(parts) == 2:
            return parts[1]
        return sid
        
    df['scenario_family'] = df['scenario_id'].apply(get_scenario_family)
    
    report = []
    for family in df['scenario_family'].unique():
        sub_df = df[df['scenario_family'] == family]
        y_true = sub_df['is_abuse']
        
        # for negative scenarios like background and seasonal_burst, we care about FPR
        # for positive like coordinated_burst, merchant_ring, we care about Recall
        
        if y_true.sum() == 0:
            # purely negative
            fp_A = (sub_df['pred_A'] == 1).sum()
            fp_B = (sub_df['pred_B'] == 1).sum()
            report.append(f"- **{family}**: Model A FP={fp_A} ({fp_A/len(sub_df):.2%}), Model B FP={fp_B} ({fp_B/len(sub_df):.2%}) [Total={len(sub_df)}]")
        else:
            tp_A = ((sub_df['is_abuse'] == 1) & (sub_df['pred_A'] == 1)).sum()
            tp_B = ((sub_df['is_abuse'] == 1) & (sub_df['pred_B'] == 1)).sum()
            total_pos = y_true.sum()
            report.append(f"- **{family}**: Model A Recall={tp_A/total_pos:.2%} ({tp_A}/{total_pos}), Model B Recall={tp_B/total_pos:.2%} ({tp_B}/{total_pos})")
            
    return "\n".join(report)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config = load_config(os.path.join(base_dir, 'configs', 'model.yaml'))
    
    data_dir = os.path.join(base_dir, 'artifacts', 'data')
    df = pd.read_csv(os.path.join(data_dir, 'features.csv'))
    df_test = df[df['split'] == 'test'].copy()
    
    target_col = config['target_col']
    
    # Load models
    model_dir = os.path.join(base_dir, 'artifacts', 'models')
    
    with open(os.path.join(model_dir, 'logistic_baseline.pkl'), 'rb') as f:
        artifact_A = pickle.load(f)
        
    with open(os.path.join(model_dir, 'xgboost_graph.pkl'), 'rb') as f:
        artifact_B = pickle.load(f)
        
    print("Evaluating Model A (Logistic Regression - Baseline)...")
    metrics_A, y_pred_A, y_prob_A = evaluate_model(artifact_A, df_test, target_col)
    
    print("Evaluating Model B (XGBoost - Graph Enhanced)...")
    metrics_B, y_pred_B, y_prob_B = evaluate_model(artifact_B, df_test, target_col)
    
    print("Analyzing scenarios...")
    scenario_report = analyze_scenarios(df_test, y_pred_A, y_pred_B)
    
    # Generate Markdown Report
    report = f"""# P1 Experiment Report: Temporal vs Graph-Enhanced Fusion Model

## 1. Files Created/Modified
- `src/features.py` (Added incremental graph feature extraction)
- `src/train_p1.py` (XGBoost Model B training)
- `src/evaluate_p1.py` (Evaluation and comparison script)
- `tests/test_graph.py` (Graph smoke tests)
- `requirements.txt` (Added networkx, xgboost)

## 2. Graph Representation
- **Structure**: Lightweight Bipartite Multi-edge Temporal Graph simulated incrementally using `networkx`. 
- **Nodes**: Customers (C_), Merchants (M_), Devices (D_), Payment Methods (P_).
- **Edges**: (C, M), (C, D), (C, P) representing transactions.
- **Library**: `networkx` directly integrating with a streaming `collections.deque` sliding window.

## 3. Five Graph Features (Exact Definitions)
1. `customer_degree_24h`: Count of unique merchants, devices, and payment methods the customer transacted with in the last 24h. (Degree of customer node in the graph).
2. `shared_device_customers_24h`: Number of OTHER customers who used the same device(s) as the given customer in the last 24h.
3. `shared_pm_customers_24h`: Number of OTHER customers who used the same payment method(s) as the given customer in the last 24h.
4. `two_hop_customer_count_24h`: Number of OTHER customers reachable in exactly two hops (Customer -> Entity -> Customer).
5. `local_cluster_density_24h`: Bipartite edge density between the customer's 2-hop customer neighborhood and all their connected entities. 

## 4. Graph Observation Window
- **Window**: `[t - 24h, t]` where `t` is the prediction timestamp.
- **Mechanism**: A sliding window `deque` prunes all transactions strictly `< t - 24h`.

## 5. Evidence of Time-Safety (Zero Leakage)
- The sliding window is updated linearly across the entire timeline (Train -> Val -> Test) without ever seeing future rows.
- Transactions are ordered by `ts`. When evaluating feature state at time `t`, only elements strictly prior to `t` and the exact entities in transaction at `t` (simulating the live event) are used.
- Smoke tests verify temporal integrity explicitly.

## 6. Graph Smoke Test Results
(To be updated with `pytest` results)

## 7. Model A Metrics (P0 Baseline)
- **Validation Threshold**: {artifact_A['threshold']:.4f}
- **Precision**: {metrics_A['precision']:.4f}
- **Recall**: {metrics_A['recall']:.4f}
- **F1 Score**: {metrics_A['f1']:.4f}
- **PR-AUC**: {metrics_A['pr_auc']:.4f}
- **False Positive Rate (FPR)**: {metrics_A['fpr']:.4f}
- **Expected Cost**: {metrics_A['cost']}
- **Confusion Matrix**: TN={metrics_A['confusion_matrix']['tn']}, FP={metrics_A['confusion_matrix']['fp']}, FN={metrics_A['confusion_matrix']['fn']}, TP={metrics_A['confusion_matrix']['tp']}

## 8. Model B Metrics (P1 Graph-Enhanced XGBoost)
- **Validation Threshold**: {artifact_B['threshold']:.4f}
- **Precision**: {metrics_B['precision']:.4f}
- **Recall**: {metrics_B['recall']:.4f}
- **F1 Score**: {metrics_B['f1']:.4f}
- **PR-AUC**: {metrics_B['pr_auc']:.4f}
- **False Positive Rate (FPR)**: {metrics_B['fpr']:.4f}
- **Expected Cost**: {metrics_B['cost']}
- **Confusion Matrix**: TN={metrics_B['confusion_matrix']['tn']}, FP={metrics_B['confusion_matrix']['fp']}, FN={metrics_B['confusion_matrix']['fn']}, TP={metrics_B['confusion_matrix']['tp']}

## 9. Deltas (Model B - Model A)
- **PR-AUC Delta**: {metrics_B['pr_auc'] - metrics_A['pr_auc']:+.4f}
- **Precision Delta**: {metrics_B['precision'] - metrics_A['precision']:+.4f}
- **Recall Delta**: {metrics_B['recall'] - metrics_A['recall']:+.4f}
- **FPR Delta**: {metrics_B['fpr'] - metrics_A['fpr']:+.4f}
- **Expected Cost Delta**: {metrics_B['cost'] - metrics_A['cost']:+}

## 10. Scenario-Level Observations
{scenario_report}

## 11. Conclusion
*Did graph context improve PR-AUC?* Yes/No ({metrics_B['pr_auc']:.4f} vs {metrics_A['pr_auc']:.4f})
*Did graph context reduce expected false-positive cost?* Yes/No ({metrics_B['cost']} vs {metrics_A['cost']})

(See metrics above for actual values)
"""
    
    report_path = os.path.join(base_dir, 'artifacts', 'evaluation', 'p1_experiment_report.md')
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, 'w') as f:
        f.write(report)
        
    print(f"Report written to {report_path}")

if __name__ == "__main__":
    main()
