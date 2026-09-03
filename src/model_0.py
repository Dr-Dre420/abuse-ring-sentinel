"""Model 0: Naive Single-Signal Heuristic Baseline.

Establishes an intuitive, transparent non-ML floor for abuse detection.
The rule flags a transaction as suspicious if a single intuitive temporal feature
meets or exceeds a threshold selected strictly on the validation set.

Operational Objective:
    Minimize expected financial cost (C_FP = $10, C_FN = $500) under the
    operational constraint of Recall >= 0.80.
"""

import json
import os
import numpy as np
import pandas as pd
from sklearn.metrics import (
    auc,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)

FEATURE_NAME = "merchant_velocity_1h"
C_FP = 10
C_FN = 500
MIN_RECALL = 0.80


def calculate_expected_cost(y_true, y_pred, c_fp=C_FP, c_fn=C_FN):
    """Calculate expected financial operational cost."""
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return float(c_fp * fp + c_fn * fn)


def select_naive_threshold(
    df_val: pd.DataFrame,
    feature: str = FEATURE_NAME,
    min_recall: float = MIN_RECALL,
    c_fp: int = C_FP,
    c_fn: int = C_FN,
):
    """Select the optimal threshold on validation data only.

    Objective: Minimize expected cost subject to Recall >= min_recall.
    """
    scores = df_val[feature].fillna(0).values
    y_val = df_val["is_abuse"].values
    unique_thresholds = np.sort(np.unique(scores))

    best_threshold = None
    min_cost = float("inf")
    best_metrics = {}

    for t in unique_thresholds:
        y_pred = (scores >= t).astype(int)
        r = recall_score(y_val, y_pred, zero_division=0)
        if r >= min_recall:
            tn, fp, fn, tp = confusion_matrix(y_val, y_pred).ravel()
            cost = c_fp * fp + c_fn * fn
            if cost < min_cost:
                min_cost = cost
                best_threshold = float(t)
                best_metrics = {
                    "validation_cost": float(cost),
                    "validation_recall": float(r),
                    "validation_precision": float(precision_score(y_val, y_pred, zero_division=0)),
                    "validation_f1": float(f1_score(y_val, y_pred, zero_division=0)),
                    "validation_cm": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
                }

    if best_threshold is None:
        raise ValueError("No threshold on validation set satisfied min_recall.")

    return best_threshold, best_metrics


def evaluate_naive_baseline(
    df_test: pd.DataFrame,
    threshold: float,
    feature: str = FEATURE_NAME,
    c_fp: int = C_FP,
    c_fn: int = C_FN,
):
    """Evaluate frozen naive rule on held-out test data."""
    scores = df_test[feature].fillna(0).values
    y_test = df_test["is_abuse"].values

    y_pred = (scores >= threshold).astype(int)

    precision = float(precision_score(y_test, y_pred, zero_division=0))
    recall = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))

    precisions, recalls, _ = precision_recall_curve(y_test, scores)
    pr_auc = float(auc(recalls, precisions))

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    cost = float(c_fp * fp + c_fn * fn)

    return {
        "model_name": "Model 0 — Naive Single-Signal Heuristic",
        "signal": feature,
        "frozen_threshold": threshold,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "pr_auc": pr_auc,
        "false_positive_rate": fpr,
        "expected_cost": cost,
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }


def run_model_0_evaluation(data_path: str = "artifacts/data/features.csv", output_path: str = "artifacts/evaluation/model_0_metrics.json"):
    """Execute complete deterministic evaluation pipeline for Model 0."""
    df = pd.read_csv(data_path)
    df_val = df[df["split"] == "val"].copy()
    df_test = df[df["split"] == "test"].copy()

    threshold, val_metrics = select_naive_threshold(df_val)
    test_metrics = evaluate_naive_baseline(df_test, threshold)

    results = {
        **test_metrics,
        "validation_metrics": val_metrics,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Model 0 evaluation complete. Results saved to {output_path}")
    return results


if __name__ == "__main__":
    run_model_0_evaluation()
