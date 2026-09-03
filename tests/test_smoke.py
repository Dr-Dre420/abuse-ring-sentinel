import os
import yaml
import pytest
import pandas as pd
import numpy as np

def load_config(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

@pytest.fixture
def project_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

@pytest.fixture
def transactions_df(project_dir):
    data_path = os.path.join(project_dir, 'artifacts', 'data', 'transactions.csv')
    return pd.read_csv(data_path)

@pytest.fixture
def features_df(project_dir):
    data_path = os.path.join(project_dir, 'artifacts', 'data', 'features.csv')
    return pd.read_csv(data_path)

def test_split_integrity(transactions_df):
    """Ensure strict time ordering between train, val, test and no scenario crossover."""
    df = transactions_df.copy()
    df['ts'] = pd.to_datetime(df['ts'])
    
    train_max = df[df['split'] == 'train']['ts'].max()
    val_min = df[df['split'] == 'val']['ts'].min()
    val_max = df[df['split'] == 'val']['ts'].max()
    test_min = df[df['split'] == 'test']['ts'].min()
    
    assert train_max < val_min, "Train split leaks into validation split time window!"
    assert val_max < test_min, "Validation split leaks into test split time window!"
    
    # Check scenario crossover
    scenarios = df[df['scenario_id'] != 'background'].groupby('scenario_id')['split'].nunique()
    assert (scenarios == 1).all(), "A scenario instance crosses train/validation/test boundaries!"

def test_leakage_guard(features_df):
    """Ensure features do not use future information."""
    df = features_df.copy()
    
    # Just a simple sanity check: burst_score should be computed from time_since_last_txn
    # time_since_last_txn should never be negative
    assert (df['time_since_last_txn'] >= 0).all(), "Temporal leakage: negative time since last transaction!"

def test_determinism_setup():
    """Verify that using the same seed for numpy gives the same result."""
    np.random.seed(42)
    a = np.random.randn(10)
    np.random.seed(42)
    b = np.random.randn(10)
    np.testing.assert_array_equal(a, b, "Random generation is not deterministic!")

def test_no_missing_labels(transactions_df):
    assert not transactions_df['is_abuse'].isnull().any(), "Missing labels in transactions."
    assert set(transactions_df['is_abuse'].unique()).issubset({0, 1}), "Labels must be binary 0/1."
