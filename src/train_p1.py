import os
import yaml
import pickle
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import precision_recall_curve, auc, confusion_matrix

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def calculate_expected_cost(y_true, y_pred, C_FP=10, C_FN=500):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return C_FP * fp + C_FN * fn

def train_xgboost_graph(df, features, target_col):
    df_train = df[df['split'] == 'train']
    df_val = df[df['split'] == 'val']
    
    X_train = df_train[features].fillna(0)
    y_train = df_train[target_col]
    
    X_val = df_val[features].fillna(0)
    y_val = df_val[target_col]
    
    print(f"Training XGBoost on {len(X_train)} samples with {len(features)} features...")
    
    # Calculate scale_pos_weight
    neg = sum(y_train == 0)
    pos = sum(y_train == 1)
    scale_pos_weight = neg / pos if pos > 0 else 1.0
    
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        eval_metric='logloss'
    )
    
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    
    # Evaluate on validation
    y_val_prob = model.predict_proba(X_val)[:, 1]
    
    # Threshold selection
    precisions, recalls, thresholds = precision_recall_curve(y_val, y_val_prob)
    pr_auc = auc(recalls, precisions)
    print(f"Validation PR-AUC (Graph XGBoost): {pr_auc:.4f}")
    
    # Cost model assumptions
    C_FP = 10
    C_FN = 500
    min_recall = 0.80
    
    best_threshold = 0.5
    min_cost = float('inf')
    
    for p, r, t in zip(precisions, recalls, thresholds):
        if r >= min_recall:
            y_pred = (y_val_prob >= t).astype(int)
            cost = calculate_expected_cost(y_val, y_pred, C_FP, C_FN)
            if cost < min_cost:
                min_cost = cost
                best_threshold = t
                
    print(f"Selected Threshold: {best_threshold:.4f} (Cost: {min_cost}, constrained to Recall >= {min_recall})")
    
    return {'model': model, 'scaler': None, 'threshold': best_threshold, 'features': features}

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config = load_config(os.path.join(base_dir, 'configs', 'model.yaml'))
    
    data_dir = os.path.join(base_dir, 'artifacts', 'data')
    df = pd.read_csv(os.path.join(data_dir, 'features.csv'))
    
    temporal_features = config['temporal_features']
    graph_features = config['graph_features']
    target_col = config['target_col']
    
    all_features = temporal_features + graph_features
    
    artifact = train_xgboost_graph(df, all_features, target_col)
    
    model_dir = os.path.join(base_dir, 'artifacts', 'models')
    os.makedirs(model_dir, exist_ok=True)
    
    with open(os.path.join(model_dir, 'xgboost_graph.pkl'), 'wb') as f:
        pickle.dump(artifact, f)
        
    print("Graph-enhanced model saved to artifacts/models/xgboost_graph.pkl")

if __name__ == "__main__":
    main()
