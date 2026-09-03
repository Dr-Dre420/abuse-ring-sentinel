import os
import yaml
import json
import pickle
import pandas as pd
import numpy as np
from sklearn.metrics import precision_score, recall_score, f1_score, precision_recall_curve, auc, confusion_matrix

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def calculate_expected_cost(y_true, y_pred, C_FP=10, C_FN=500):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return C_FP * fp + C_FN * fn

def evaluate_model(df, artifact, target_col):
    df_test = df[df['split'] == 'test']
    
    model = artifact['model']
    scaler = artifact['scaler']
    threshold = artifact['threshold']
    features = artifact['features']
    
    X_test = df_test[features].fillna(0)
    y_test = df_test[target_col]
    
    print(f"Evaluating on {len(X_test)} held-out test samples...")
    X_test_scaled = scaler.transform(X_test)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)
    
    # Calculate metrics
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    
    precisions, recalls, thresholds = precision_recall_curve(y_test, y_prob)
    pr_auc = auc(recalls, precisions)
    
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    
    cost = calculate_expected_cost(y_test, y_pred)
    
    metrics = {
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'pr_auc': pr_auc,
        'false_positive_rate': fpr,
        'expected_cost': float(cost),
        'confusion_matrix': {
            'tn': int(tn),
            'fp': int(fp),
            'fn': int(fn),
            'tp': int(tp)
        },
        'threshold_used': float(threshold)
    }
    
    return metrics

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config = load_config(os.path.join(base_dir, 'configs', 'model.yaml'))
    
    data_dir = os.path.join(base_dir, 'artifacts', 'data')
    df = pd.read_csv(os.path.join(data_dir, 'features.csv'))
    
    model_dir = os.path.join(base_dir, 'artifacts', 'models')
    
    with open(os.path.join(model_dir, 'logistic_baseline.pkl'), 'rb') as f:
        artifact = pickle.load(f)
        
    target_col = config['target_col']
    
    metrics = evaluate_model(df, artifact, target_col)
    
    eval_dir = os.path.join(base_dir, 'artifacts', 'evaluation')
    os.makedirs(eval_dir, exist_ok=True)
    
    with open(os.path.join(eval_dir, 'baseline_metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)
        
    print("Test Evaluation Results:")
    print(json.dumps(metrics, indent=2))
    
if __name__ == "__main__":
    main()
