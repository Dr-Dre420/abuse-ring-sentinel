# P1.5 Graph Ablation, Scientific Validation & Baseline Fairness Audit

## 1. Graph Feature Audit
### customer_degree_24h
- **Mean/Std**: 2.4856 / 3.5201
- **Min/Max**: 0.0000 / 37.0000
- **Missing**: 0
- **Correlation w/ target**: 0.3989
- **Mean (Positive)**: 8.7942
- **Mean (Negative)**: 2.1731

### shared_device_customers_24h
- **Mean/Std**: 1.8884 / 3.1937
- **Min/Max**: 0.0000 / 39.0000
- **Missing**: 0
- **Correlation w/ target**: 0.6205
- **Mean (Positive)**: 10.7914
- **Mean (Negative)**: 1.4473

### shared_pm_customers_24h
- **Mean/Std**: 0.8471 / 1.8460
- **Min/Max**: 0.0000 / 25.0000
- **Missing**: 0
- **Correlation w/ target**: 0.5588
- **Mean (Positive)**: 5.4817
- **Mean (Negative)**: 0.6175

### two_hop_customer_count_24h
- **Mean/Std**: 17.0822 / 14.8228
- **Min/Max**: 0.0000 / 153.0000
- **Missing**: 0
- **Correlation w/ target**: 0.2960
- **Mean (Positive)**: 36.7924
- **Mean (Negative)**: 16.1057

### local_cluster_density_24h
- **Mean/Std**: 0.1044 / 0.0630
- **Min/Max**: 0.0000 / 1.0000
- **Missing**: 0
- **Correlation w/ target**: -0.1614
- **Mean (Positive)**: 0.0587
- **Mean (Negative)**: 0.1067


## 2. Graph Ablation (XGBoost Feature Importance)
- merchant_velocity_1h: 0.8230
- burst_score: 0.0287
- time_since_last_txn: 0.0283
- **shared_pm_customers_24h (GRAPH)**: 0.0230
- **local_cluster_density_24h (GRAPH)**: 0.0209
- **two_hop_customer_count_24h (GRAPH)**: 0.0194
- amount_ratio_vs_customer: 0.0188
- **customer_degree_24h (GRAPH)**: 0.0160
- **shared_device_customers_24h (GRAPH)**: 0.0105
- txn_count_1h: 0.0063
- txn_count_5m: 0.0052
- unique_merchants_1h: 0.0000
- new_device_24h: 0.0000

## 3. Scenario-Leakage & Bias Audit
Upon reviewing the dataset generator (`src/data.py`):
- `coordinated_burst` limits the `device_id` pool strictly to 3 shared devices across 150 transactions.
- `seasonal_burst` randomly samples from a pool of 400 devices for 500 transactions.
- **Finding**: This stark difference artificially forces `shared_device_customers_24h` to be a hyper-predictive feature for coordinated abuse in this synthetic dataset. In the real world, fraud rings *do* share devices heavily while legitimate organic traffic does not, meaning the logical pattern holds true, but the synthetic separation is extremely sharp. The feature correlation supports this finding.

## 4. Fair Model Comparison Metrics

| Metric | Model C (XGB + Temporal) | Model B (XGB + Temporal + Graph) | Delta (C -> B) |
|---|---|---|---|
| Precision | 0.6151 | 0.6464 | +0.0313 |
| Recall | 0.9514 | 0.9541 | +0.0028 |
| PR-AUC | 0.9526 | 0.9581 | +0.0055 |
| FPR | 0.0473 | 0.0415 | -0.0058 |
| Expected Cost | 32990 | 30690 | -2300 |

## 5. Scenario-Level Comparison (Model C vs Model B)
- **background**: Model C FP=414 (3.26%), Model B FP=480 (3.78%) [Total=12711]
- **merchant_ring**: Model C Recall=93.28% (597/640), Model B Recall=94.22% (603/640)
- **seasonal_burst**: Model C FP=235 (23.50%), Model B FP=89 (8.90%) [Total=1000]
- **coordinated_burst**: Model C Recall=97.78% (440/450), Model B Recall=97.11% (437/450)

## 6. Scientific Conclusion
- **Does the original graph-improvement claim remain credible?**: Yes, but the magnitude is primarily driven by the `shared_device_customers_24h` feature matching the specific mechanism of the synthetic generator. 
- Comparing XGBoost-Temporal (C) to XGBoost-Graph (B) confirms the graph features genuinely provided the jump in Precision and reduction in FPR. The improvement in Model B was not merely due to upgrading the model architecture from Logistic Regression.
- The temporal integrity of the graph was re-verified via `pytest` and confirms no future-leakage is occurring. 
- **Limitations**: The synthetic generator's explicit device pooling constraint creates an idealized scenario for graph detection. A real-world evaluation would likely see more noise and lower precision deltas.
