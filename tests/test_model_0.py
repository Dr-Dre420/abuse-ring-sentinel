"""Tests for Model 0 (Naive Single-Signal Heuristic Baseline)."""

import json
import os
import numpy as np
import pandas as pd
import pytest
from src.model_0 import (
    evaluate_naive_baseline,
    run_model_0_evaluation,
    select_naive_threshold,
)


@pytest.fixture(scope="module")
def features_data():
    path = "artifacts/data/features.csv"
    assert os.path.exists(path), f"features.csv not found at {path}"
    df = pd.read_csv(path)
    return df


def test_threshold_selected_on_validation_only(features_data):
    """Verify that threshold selection operates strictly on validation data and does not access test data."""
    df_val = features_data[features_data["split"] == "val"].copy()

    # Threshold selection only receives df_val
    threshold, val_metrics = select_naive_threshold(df_val, feature="merchant_velocity_1h")

    assert threshold == 2.0
    assert val_metrics["validation_recall"] >= 0.80
    assert val_metrics["validation_cost"] == 29990.0
    assert val_metrics["validation_cm"]["tp"] == 1050
    assert val_metrics["validation_cm"]["fp"] == 999


def test_naive_threshold_selection_is_deterministic(features_data):
    """Verify that multiple threshold selection calls produce the exact same threshold."""
    df_val = features_data[features_data["split"] == "val"].copy()

    t1, _ = select_naive_threshold(df_val, feature="merchant_velocity_1h")
    t2, _ = select_naive_threshold(df_val, feature="merchant_velocity_1h")

    assert t1 == t2
    assert t1 == 2.0


def test_naive_rule_held_out_evaluation(features_data):
    """Verify that evaluation on held-out test data produces deterministic results."""
    df_test = features_data[features_data["split"] == "test"].copy()
    frozen_threshold = 2.0

    metrics = evaluate_naive_baseline(df_test, threshold=frozen_threshold, feature="merchant_velocity_1h")

    assert metrics["frozen_threshold"] == 2.0
    assert round(metrics["precision"], 4) == 0.5334
    assert round(metrics["recall"], 4) == 0.9606
    assert round(metrics["f1"], 4) == 0.6859
    assert round(metrics["pr_auc"], 4) == 0.9460
    assert round(metrics["false_positive_rate"], 4) == 0.0668
    assert metrics["expected_cost"] == 30660.0

    cm = metrics["confusion_matrix"]
    assert cm["tn"] == 12795
    assert cm["fp"] == 916
    assert cm["fn"] == 43
    assert cm["tp"] == 1047


def test_saved_model_0_artifact_matches():
    """Verify that saved artifact exists and matches test calculations."""
    path = "artifacts/evaluation/model_0_metrics.json"
    assert os.path.exists(path), f"Artifact missing at {path}"

    with open(path, "r") as f:
        data = json.load(f)

    assert data["signal"] == "merchant_velocity_1h"
    assert data["frozen_threshold"] == 2.0
    assert data["expected_cost"] == 30660.0
    assert data["confusion_matrix"]["tp"] == 1047
    assert data["confusion_matrix"]["fp"] == 916
