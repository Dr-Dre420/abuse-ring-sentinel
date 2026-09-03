import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import sys

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from src.features import compute_graph_features

def test_temporal_graph_integrity():
    """
    TEST A: Temporal graph integrity.
    Verify that graph features do not depend on transactions occurring later than the prediction timestamp.
    """
    # Create synthetic transactions
    ts1 = datetime(2026, 1, 1, 10, 0, 0)
    ts2 = datetime(2026, 1, 1, 11, 0, 0)
    ts3 = datetime(2026, 1, 1, 12, 0, 0)
    
    df = pd.DataFrame([
        {'ts': ts1, 'customer_id': 'C1', 'merchant_id': 'M1', 'device_id': 'D1', 'pm_id': 'P1'},
        {'ts': ts2, 'customer_id': 'C2', 'merchant_id': 'M1', 'device_id': 'D1', 'pm_id': 'P2'},
        {'ts': ts3, 'customer_id': 'C3', 'merchant_id': 'M1', 'device_id': 'D1', 'pm_id': 'P3'}
    ])
    
    # Run graph features
    res = compute_graph_features(df)
    
    # At ts1, C1 should have 0 shared devices, PMs, or 2-hop customers
    row1 = res.iloc[0]
    assert row1['shared_device_customers_24h'] == 0
    assert row1['two_hop_customer_count_24h'] == 0
    
    # At ts2, C2 shares D1 with C1. So shared_device_customers_24h = 1
    row2 = res.iloc[1]
    assert row2['shared_device_customers_24h'] == 1
    assert row2['two_hop_customer_count_24h'] == 1
    
    # If there was leakage, C1 at ts1 would see C2 or C3, which it does not.

def test_graph_determinism():
    """
    TEST B: Graph determinism.
    Same input -> same graph features.
    """
    ts = datetime(2026, 1, 1, 10, 0, 0)
    df = pd.DataFrame([
        {'ts': ts, 'customer_id': 'C1', 'merchant_id': 'M1', 'device_id': 'D1', 'pm_id': 'P1'},
        {'ts': ts + timedelta(hours=1), 'customer_id': 'C2', 'merchant_id': 'M1', 'device_id': 'D1', 'pm_id': 'P2'},
    ])
    
    res1 = compute_graph_features(df)
    res2 = compute_graph_features(df)
    
    pd.testing.assert_frame_equal(res1, res2)

def test_graph_feature_availability():
    """
    TEST C: Graph feature availability.
    No unexpected missing values.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    txns_path = os.path.join(base_dir, 'artifacts', 'data', 'transactions.csv')
    
    if os.path.exists(txns_path):
        df = pd.read_csv(txns_path, nrows=500)
        df['ts'] = pd.to_datetime(df['ts'])
        res = compute_graph_features(df)
        
        graph_cols = ['customer_degree_24h', 'shared_device_customers_24h', 'shared_pm_customers_24h', 
                      'two_hop_customer_count_24h', 'local_cluster_density_24h']
        
        # Check no NaNs
        assert not res[graph_cols].isnull().any().any()
        # Check not all zeros (unless extremely sparse)
        assert res['customer_degree_24h'].sum() > 0

def test_feature_label_sanity():
    """
    TEST D: Feature/label sanity.
    Check that features are not just trivially identical to target.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    feat_path = os.path.join(base_dir, 'artifacts', 'data', 'features.csv')
    
    if os.path.exists(feat_path):
        df = pd.read_csv(feat_path)
        
        graph_cols = ['customer_degree_24h', 'shared_device_customers_24h', 'shared_pm_customers_24h', 
                      'two_hop_customer_count_24h', 'local_cluster_density_24h']
        
        for col in graph_cols:
            # Check variance is not zero
            assert df[col].var() > 0
            
            # Check correlation with target is not perfectly 1.0 or -1.0
            corr = df[col].corr(df['is_abuse'])
            assert abs(corr) < 0.99
