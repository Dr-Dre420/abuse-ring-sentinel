# Abuse-Ring Sentinel

> **Defense-only payment abuse detection using temporal behavioral signals and causal 24-hour graph context.**

---

### Context & Operational Posture

| Attribute | Specification |
| :--- | :--- |
| **Track** | Razorpay AI Risk Manager |
| **Repository** | [https://github.com/Dr-Dre420/abuse-ring-sentinel](https://github.com/Dr-Dre420/abuse-ring-sentinel) |
| **System Classification** | Defense-Only Risk Intelligence (Human-in-the-Loop) |
| **Operational Principle** | Temporal behavior detects suspicious activity; causal relational context evaluates coordination. |
| **Safety Invariant** | **No financial action is executed automatically.** All defensive outputs require human analyst authorization. |
| **Evaluation Scope** | Synthetic Evaluation ($N = 14,801$ held-out test set); not a production benchmark. |
| **Methodology Status** | Frozen, reproducible, and multi-seed verified. |

---

## Product Experience

Abuse-Ring Sentinel is structured as an **AI-assisted payment risk investigation workspace**. Rather than operating as an autonomous blocking engine or a generic metric dashboard, it guides analysts through a structured, evidence-grounded risk decision workflow.

### Investigation Showcase

#### 1. Model Disagreement & False-Positive Suppression (Case C)
![Model Disagreement & Investigation Workspace](assets/screenshots/case_c_disagreement.png)

> **Model Disagreement Analysis (Case C / T60698)**: The temporal baseline flags high holiday surge volume (Model C: `0.2857` vs. threshold `0.2383`), while the 24-hour causal relational graph verifies an isolated, organic footprint (0 shared payment methods, 1 shared device), reducing the risk assessment (Model B: `0.1178` vs. threshold `0.1519`, $\Delta = -0.1679$). The system recommends **Monitor** with zero financial disruption.

---

#### 2. Coordinated Abuse Ring Consensus (Case A)
![Coordinated Abuse Investigation](assets/screenshots/case_a_investigation.png)

> **Model Agreement Analysis (Case A / T57997)**: Both models flag high risk (`1.0000` probability) when single-account velocity ($52\text{ txns/hr}$) is reinforced by multiplexed physical infrastructure ($28\text{ accounts}$ recycled on device `D97`). The system routes the case to **Escalate for Analyst Authorization** for human settlement hold approval.

---

#### 3. Model Evaluation & Multi-Seed Benchmark
![Model Evaluation Dashboard](assets/screenshots/model_evaluation.png)

> **Controlled Model Evaluation**: Direct side-by-side comparison of Model C (Temporal Control) vs. Model B (Temporal + Graph), displaying held-out confusion matrices, multi-seed sensitivity analysis across Seeds 42, 100, and 999, and the Precision-Recall curve canvas.

---

### Workspace Views

The application provides two primary operational views and one secondary benchmarking view:

1. **Cases (Curated Scenarios)**:
   - Scenario categorization (`coordinated_burst`, `merchant_ring`, `seasonal_burst`).
   - Ground-truth visibility, transaction amounts, single-account hourly velocity telemetry, and device reuse counts.
   - Live state pills distinguishing **Model Agreement** from **Model Disagreement**.
   - Prominent **Key Scientific Finding** banner ($51.9\%$ seasonal-burst false-positive reduction) accessible directly without navigation.

2. **Investigate (Investigation Workspace)**:
   - **Dual-Model Inference**: Direct comparison of Model C (Temporal Only) against Model B (Temporal + 24h Relational Graph) with probability progress meters and validation-frozen operating threshold markers.
   - **Risk Delta Callout**: Explicit explanation of how relational graph context modified the temporal baseline score ($\Delta = \text{Score}_B - \text{Score}_C$).
   - **Observable Evidence Pipeline**: Structured 3-step evidence breakdown:
     - `01 Behavioral Signals`: Rolling velocity acceleration, burst scores, and customer transaction ratios.
     - `02 Relational Topology`: Bipartite entity sharing, 2-hop neighbor reach, and local cluster density.
     - `03 Synthesis`: Calibrated risk interpretation grounded in observable evidence.
   - **Interactive 3D Causal Ego-Network**: WebGL visualization of the customer's 24-hour bipartite network topology with real-time entity inspection.
   - **Static Investigation Timeline**: 5-stage deterministic pre-event trajectory ($T - 24\text{h} \to T0$) constructed strictly from pre-arrival historical events.
   - **Analyst Disposition Workflow**: Non-autonomous action selector (`Monitor`, `Analyst Review`, `Escalate for Authorization`) that records decisions into a local session audit log.

3. **Model Evaluation (Benchmark Suite)**:
   - Secondary analytical view containing aggregate comparison metrics (PR-AUC, Precision, Recall, Expected Cost).
   - High-resolution HTML5 Canvas Precision-Recall curves.
   - Full held-out confusion matrices evaluated at validation-frozen optimal operating points.
   - Multi-seed stability verification table across Seeds 42, 100, and 999.
   - Global XGBoost feature importance attribution breakdown.

> *Note*: This workspace is a technical demonstration and analyst investigation tool; it is not a live production payment queue.

---

## How the Product Works

The analyst investigation follows a deterministic, evidence-grounded sequence:

```
Cases Overview
      │
      ▼
Select Investigation Scenario (e.g. Case C / T60698)
      │
      ▼
Compare Dual Model Decisions (Model C vs. Model B)
      │
      ▼
Inspect Behavioral Telemetry (1h velocity, burst score, amount ratio)
      │
      ▼
Inspect Relational Context (Shared devices, shared cards, 2-hop reach)
      │
      ▼
Explore Interactive 3D Causal Ego-Network (Orbit, zoom, inspect entities)
      │
      ▼
Trace 24-Hour Pre-Event Trajectory (Deterministic event timeline with zero lookahead)
      │
      ▼
Record Analyst Disposition (Log human authorization into local session audit trail)
      │
      ▼
Optionally Inspect Model Evaluation (Audit PR curves, seed sensitivity & cost trade-offs)
```

---

## Interactive 3D Causal Ego-Network

The investigation workspace incorporates an interactive **3D Causal Ego-Network** rendered via WebGL:

```
           [ Shared Device D851 ]
                  /      \
                 /        \
[ Customer C1711 (Focal) ]  [ Customer C1842 ]
                 \
                  \
           [ Merchant M0 ]
```

### Technical Design & Capabilities

- **Zero-Lookahead Construction**: Graph state strictly represents transactions recorded in the causal pre-event window $[t - 24\text{h}, t)$ prior to transaction arrival at timestamp $t$. Subsequent transactions are mathematically excluded.
- **Bipartite Entity Graph**: Projects customers ($C$), merchants ($M$), physical devices ($D$), and payment instruments ($P$) as distinct 3D nodes connected by directed transaction and usage edges.
- **Interactive Controls**:
  - **Orbit & Pan**: Full 3D spatial rotation via mouse drag and touch gestures.
  - **Zoom**: Smooth perspective scaling via scroll wheel.
  - **Auto-Fit & Center**: `Fit Network` and `Reset View` controls automatically re-frame the camera around the active cluster using D3 force settling.
  - **Focus Focal**: Smoothly pans the camera directly to the focal customer under investigation.
  - **Dynamic Highlighting**: Hovering over or clicking any node illuminates connected edges and neighbor nodes while subtly dimming unrelated infrastructure.
- **Entity Inspector**: Real-time inspection panel displays entity identifier, classification type, and accurate connected degree counts (e.g., verifying focal customer $C1711$ links to 3 infrastructure/merchant entities, while payment instrument $P1418$ links exclusively to 1 customer).
- **Fallback Guarantee**: In environments without WebGL hardware acceleration, an HTML5 2D Canvas force-directed renderer automatically initializes to ensure zero disruption.

> **Methodological Clarification**: Graph topology alone does **not** detect abuse. The graph provides an **incremental relational context layer** that validates or suppresses velocity alerts triggered by the primary temporal behavioral model.

---

## 1. Problem Definition & Architectural Thesis

Modern payment fraud presents two conflicting failure modes in transaction-level scoring:

1. **Distributed Syndicate Attacks**: Organized fraud syndicates split volume across dozens of synthetic customer identities, rotating virtual cards and devices to keep single-account velocity deceptively low.
2. **Flash Sale False Positive Spikes**: High-velocity promotional campaigns and festive flash sales cause benign organic buyers to mimic abusive velocity surges. Unaugmented tabular models trigger aggressive false declines, inflicting severe merchant friction and lost revenue ($C_{FP}$).

### The Core Thesis

- **Temporal behavioral velocity detects the surge** (~81% feature gain from 1-hour merchant velocity).
- **Causal 24-hour relational graph context determines coordination** (distinguishing concentrated infrastructure reuse from dispersed organic purchasing).
- **Human review remains the final authority** (no automated account termination, card cancellation, or settlement blocking).

---

## 2. System Architecture

```
                               Live Transaction Request [t]
                                           │
                   ┌───────────────────────┴───────────────────────┐
                   ▼                                               ▼
      Temporal Behavioral Engine                     Causal 24h Relational Graph
    (Rolling 5m, 1h, Expanding Medians)              (Sliding Window [t - 24h, t])
    ──────────────────────────────────             ──────────────────────────────────
    • txn_count_5m, txn_count_1h                   • customer_degree_24h (Strictly Prior)
    • burst_score, time_since_last_txn             • shared_device_customers_24h
    • merchant_velocity_1h (Dominant Signal)       • shared_pm_customers_24h
    • amount_ratio_vs_customer                     • two_hop_customer_count_24h
                                                   • local_cluster_density_24h
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           ▼
                          Fused Feature Vector (13 Features)
                                           │
                                           ▼
                          XGBoost Graph-Enhanced Model (B)
                                           │
                         ┌─────────────────┴─────────────────┐
                         ▼                                   ▼
              Model Probability vs Threshold       Deterministic Explainability Engine
              (Validation-Frozen Threshold)       (Zero Hallucination Rule Attribution)
                         │                                   │
                         └─────────────────┬─────────────────┘
                                           ▼
                            Reversible Defensive Action
                     ┌─────────────────────┬─────────────────────┐
                     ▼                     ▼                     ▼
              [ MONITOR ]          [ ANALYST REVIEW ]      [ ESCALATE FOR AUTHORIZATION ]
           (Organic Baseline)    (Step-up 2FA/3DS Queue)   (Human Review; Settlement Hold Rec)
                                                                  │
                                           ┌──────────────────────┴──────────────────────┐
                                           ▼                                             ▼
                           [ Human Analyst Authorized ]                    [ No Auto-Financial Action ]
```

---

## 3. Synthetic Data Generation & Audit Scope

To evaluate network hypotheses under rigorous, controlled conditions, a multi-scenario synthetic dataset generator was implemented in `src/data.py`:

- **Dataset Scale**: 69,270 transactions across 90 days.
- **Entity Pool**: 2,000 customers, 100 merchants, 1,000 devices, 2,500 payment instruments.
- **Class Balance**: 95.28% legitimate (66,000 transactions), 4.72% abusive (3,270 transactions).
- **Scenario Breakdown**:
  - `coordinated_burst`: Abusive burst targeting merchants via shared physical devices and cards.
  - `merchant_ring`: Collusive merchant ring operating with synthetic buyer accounts.
  - `seasonal_burst`: High-velocity holiday sales with natural, dispersed customer-merchant overlap.
  - `background`: Ambient organic transaction stream.
- **Strict Chronological Splits** (Zero data shuffle):
  - **Train**: 60% (39,756 transactions)
  - **Validation**: 20% (14,713 transactions)
  - **Held-Out Test**: 20% (14,801 transactions)

> **Synthetic Evaluation Disclosure**: This project is evaluated on synthetic data and is not a production benchmark. Real-world payment networks exhibit residential proxy rotations, missing telemetry, and complex behavioral noise not fully present in synthetic generators.

---

## 4. Temporal Leakage Controls

To ensure strict scientific integrity, all feature extraction incorporates zero-lookahead temporal controls:

- **Pre-Event State Commitment**: For any transaction at timestamp $t$, causal graph features are computed from the historical graph state **strictly before** the transaction's edges are committed. Customer degree and neighborhood reach reflect only prior events.
- **Incremental FIFO Sliding Window**: Edges outside the sliding $[t - 24\text{h}, t)$ window are automatically evicted from memory via a FIFO queue (`collections.deque`).
- **Deterministic Timestamp Tie-Breaking**: Transactions arriving at identical second timestamps are sequenced deterministically by arrival order, replicating an event-streaming message bus.
- **Zero Future Contamination**: Rolling behavioral states and graph windows do not leak from test to train. Verified by automated regression tests in `tests/test_graph.py`.

---

## 5. Experiment Ladder & Model Methodology

The project evaluates four benchmark tiers to isolate incremental signal value:

1. **Model 0 (Naive Heuristic Floor)**: Non-ML rule (`merchant_velocity_1h >= 2.0`) selected on the validation set to minimize expected cost under $\text{Recall} \ge 0.80$.
2. **Model A (Linear Baseline Floor)**: Balanced Logistic Regression on temporal features, assessing linear separability.
3. **Model C (Temporal XGBoost Control)**: Gradient boosted trees (`max_depth=4`, `learning_rate=0.1`) trained exclusively on temporal behavioral features.
4. **Model B (Temporal + Graph XGBoost)**: Identical architecture and hyperparameters as Model C, augmented with 5 causal 24-hour relational graph features:
   - `customer_degree_24h`
   - `shared_device_customers_24h`
   - `shared_pm_customers_24h`
   - `two_hop_customer_count_24h`
   - `local_cluster_density_24h`

> **Controlled Graph Experiment**: The isolated experiment is **Model C vs. Model B**. Both share identical training splits, temporal features, and XGBoost hyperparameters. Model 0 and Model A provide benchmark reference floors.

Operating thresholds are selected **strictly on the validation set** to minimize operational cost under $\text{Recall} \ge 0.80$, then frozen for evaluation on the held-out test set ($N = 14,801$).

---

## 6. Validated Results

### Controlled Benchmark: Model C vs. Model B (3-Seed Mean)

Across the 3-seed evaluation audit on the held-out test set ($N = 14,801$):

| Evaluation Metric | Model 0 (Naive Floor) | Model A (LR Floor) | Model C (Temporal Control) | Model B (Temporal + Graph) | Delta ($\text{C} \to \text{B}$) | Operational Implication |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **PR-AUC (Mean)** | 0.9460\* | 0.9587\* | **0.9550** | **0.9568** | **+0.0018** | Modest aggregate ranking improvement |
| **Precision (Mean)** | 53.34%\* | 48.35%\* | **65.08%** | **68.65%** | **+3.57%** | Higher precision on flagged accounts |
| **Recall (Mean)** | 96.06%\* | 96.88%\* | **95.32%** | **95.15%** | **-0.17%** | Comparable high coverage on abuse |
| **F1 Score (Mean)** | 0.6859\* | 0.6451\* | **0.7731** | **0.7972** | **+0.0241** | Improved precision/recall balance |
| **FPR (Mean)** | 6.68%\* | 8.22%\* | **6.47%** | **5.59%** | **-0.88%** | Overall suppression of false positive noise |
| **Expected Cost** | 30,660\* | 28,280\* | **32,017** | **31,810** | **-207** | High seed variance ($-2,300$ to $+1,930$) |

*\*Model 0 and Model A reflect deterministic single-seed baseline floors on the held-out test set.*

### Key Scenario Finding: Seasonal-Burst False-Positive Reduction

Cost model assumption: $C_{FP} = \$10$ (analyst verification & merchant friction), $C_{FN} = \$500$ (chargeback loss and liability).

- **Seasonal Burst (`seasonal_burst`)**:
  - **Model C (Temporal Only)**: 29.17% False Positive Rate (291.7 false declines per 1,000 transactions).
  - **Model B (Temporal + Graph)**: **14.03% False Positive Rate** (140.3 false declines per 1,000 transactions).
  - **Outcome**: **51.9% relative reduction in seasonal-burst false-positive rate across the three evaluation seeds**.
- **Ambient Traffic (`background`)**: Model C: 4.67% FPR vs. Model B: 4.91% FPR (+0.24% marginal noise trade-off).
- **Coordinated Burst Detection**: Model C: 97.78% Recall vs. Model B: 97.63% Recall.
- **Merchant Ring Detection**: Model C: 94.32% Recall vs. Model B: 94.11% Recall.

### Critical Scientific Disclosures

1. **Seed-Sensitive Cost Variance**: The mean expected-cost difference of **$-207$** is **not** a robust headline metric. Across random seeds, cost deltas range from **$-2,300$** (Seed 42) to **$+1,930$** (Seed 999) due to operating threshold sensitivity around dense decision boundaries.
2. **Consistent Observed Benefit**: The most repeatable, validated benefit of graph context is the reduction in false positives during seasonal burst activity ($51.9\%$ relative reduction).
3. **Modest Aggregate Lift**: Graph context provides modest aggregate PR-AUC lift (+0.0018). Graph features act as an incremental relational filter, not a replacement for temporal detection.

---

## 7. Multi-Seed Sensitivity Audit

To verify stability, identical pipelines were executed across three distinct random seeds:

| Seed | Model C PR-AUC | Model B PR-AUC | PR-AUC Delta | Precision Delta | Expected Cost Delta |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **Seed 42** | 0.9526 | 0.9581 | **+0.0055** | **+0.0313** | **-2,300** |
| **Seed 100** | 0.9565 | 0.9598 | **+0.0032** | **+0.0152** | **-250** |
| **Seed 999** | 0.9559 | 0.9526 | **-0.0033** | **+0.0730** | **+1,930** |
| **Mean** | **0.9550** | **0.9568** | **+0.0018** | **+0.0357** | **-207** |

*Scientific Integrity Note*: Seed 999 demonstrates transparent reporting. In Seed 999, graph PR-AUC dipped slightly (-0.0033) while precision gained +7.30%. Across all seeds, the reduction in seasonal false positives remains consistent.

---

## 8. Feature Importance Attribution

Empirical analysis of XGBoost feature gain reveals the relative contribution of each signal family:

| Feature Name | Signal Type | XGBoost Gain Share | Role in Detection |
| :--- | :--- | :---: | :--- |
| `merchant_velocity_1h` | Temporal | **80.95%** | **Primary Detection Signal**: Captures high-frequency acceleration. |
| `burst_score` | Temporal | 4.62% | Measures deviation from customer historical baseline. |
| `customer_degree_24h` | Relational Graph | 4.33% | Secondary contextual signal: Total entities linked within 24h. |
| `time_since_last_txn` | Temporal | 2.62% | Inter-arrival cadence telemetry. |
| `shared_pm_customers_24h` | Relational Graph | 2.14% | Relational context: Cross-account card reuse. |
| `local_cluster_density_24h`| Relational Graph | 2.04% | Relational context: Bipartite neighborhood density. |
| `amount_ratio_vs_customer`| Temporal | 1.99% | Relative transaction sizing. |
| `two_hop_customer_count` | Relational Graph | 1.86% | Relational reachability across shared nodes. |
| `shared_device_customers` | Relational Graph | 1.13% | Physical hardware recycling across accounts. |
| *Other Features* | Temporal | < 1.00% | Rolling window telemetry. |

> **Attribution Summary**: Temporal behavioral features dominate prediction (~81% from 1-hour merchant velocity). Graph context acts as an **incremental relational layer (~7.6% combined contribution)** rather than the primary detector.

---

## 9. Curated Case Studies

### Case A (`T57997`) — Coordinated Burst Abuse (Model Agreement)
- **Telemetry**: ₹1,240.00 transaction at merchant `M84`.
- **Behavioral Signal**: Single-account velocity spikes to 52 transactions/hour.
- **Relational Evidence**: Physical device `D97` is multiplexed across 28 distinct customer accounts in 24 hours.
- **Model Decisions**: Model C score = `1.0000` (Flagged), Model B score = `1.0000` (Flagged).
- **Assessment**: Coordinated abuse indicated (high confidence).
- **Analyst Action**: **Escalate for Analyst Authorization** (recommends settlement hold on merchant payouts pending specialist review).

### Case C (`T60698`) — Seasonal Volume Burst (Model Disagreement)
- **Telemetry**: ₹4,820.00 festive checkout at merchant `M0`.
- **Behavioral Signal**: Merchant volume surge trips the temporal velocity baseline.
- **Model C Decision**: Risk score **`0.2857`** > threshold `0.2383` $\to$ **FLAGGED (False Alarm)**.
- **Relational Evidence**: Customer interacts across isolated infrastructure (0 shared payment methods, 1 shared device, isolated merchant link).
- **Model B Decision**: Risk score **`0.1178`** < threshold `0.1519` $\to$ **CLEARED (Legitimate)**.
- **Risk Delta**: **$\Delta = -0.1679$** (`LOWER RISK UNDER RELATIONAL CONTEXT`).
- **Analyst Action**: **Monitor** (allows transaction to complete normally; prevents false decline).

### Case B (`T59899`) — Collusive Merchant Ring
- **Telemetry**: ₹2,150.00 transaction at merchant `M12`.
- **Behavioral Signal**: Velocity reaches 18 transactions/hour.
- **Relational Evidence**: Device recycled across 6 synthetic buyer accounts targeting collusive merchants.
- **Model Decisions**: Both models flag high risk; relational topology reinforces synthetic coordination.
- **Analyst Action**: **Analyst Review** (routed to queue for credential inspection).

---

## 10. Safety & Responsible AI Protocol

Abuse-Ring Sentinel is architected strictly as a **defense-only decision support tool**:

- **No Autonomous Financial Action**: The system does **not** autonomously execute settlement holds, block credit cards, freeze merchant payouts, or terminate user accounts.
- **Human-in-the-Loop Protocol**: All model predictions are mapped to operational recommendations (`Monitor`, `Analyst Review`, `Escalate for Authorization`). Every financial action requires explicit human authorization.
- **Auditable Action Logging**: Analyst disposition choices are recorded in a local session audit log to ensure complete traceability.
- **Reversible Interventions**: Recommendations emphasize reversible risk mitigation (step-up 2FA, manual review, temporary hold authorization) rather than permanent account punitive actions.

---

## 11. Technology Stack

- **Machine Learning & Analytics**: Python 3.14, XGBoost, Scikit-learn, NetworkX, NumPy, Pandas.
- **API & Backend Service**: FastAPI, Uvicorn, Pydantic.
- **Frontend Architecture**: Semantic HTML5, Vanilla CSS (Dark Slate Design System with CSS variables), Vanilla JavaScript (ES6+).
- **Network Visualization**: 3D WebGL Force-Directed Graph (`3d-force-graph` / Three.js), HTML5 Canvas 2D fallback.
- **Testing & Verification**: Pytest, AnyIO.

---

## 12. Setup & Reproduction Commands

### Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/Dr-Dre420/abuse-ring-sentinel.git
cd abuse-ring-sentinel

# 2. Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate      # Windows
# source venv/bin/activate   # Linux/macOS

# 3. Install pinned dependencies
pip install -r requirements.txt
```

### Run Automated Tests

Execute the 24-test regression suite to verify graph determinism, leakage guards, API contracts, and defensive safety:

```bash
pytest -v
```

### Launch the Risk Investigation Workspace

Start the local FastAPI development server:

```bash
python -m uvicorn src.api:app --host 127.0.0.1 --port 8000 --reload
```

Open your browser and navigate to:
```
http://localhost:8000
```

---

## 13. API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | System health status, version, and model readiness. |
| `/case/demo/list` | `GET` | Returns curated benchmark cases (Case A, Case B, Case C). |
| `/case/{txn_id}` | `GET` | Detailed telemetry, dual-model scores, ego-network, and timeline for a transaction. |
| `/evaluate` | `GET` | Full evaluation payload: aggregate metrics, PR curves, confusion matrices, and seed audits. |
| `/score/batch` | `POST` | Batch transaction scoring with defensive recommendations. |

---

## 14. Repository Structure

```
abuse-ring-sentinel/
├── README.md                      # Engineering report & submission documentation
├── LICENSE                        # All Rights Reserved (Arnav Jain)
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git hygiene rules
├── requirements.txt               # Pinned Python package dependencies
├── artifacts/
│   ├── evaluation/                # Frozen metrics, static payloads & audit reports
│   └── models/                    # Trained XGBoost models & validation thresholds
├── assets/
│   └── screenshots/               # Dashboard screenshots for repository showcase
│       ├── case_a_investigation.png
│       ├── case_c_disagreement.png
│       └── model_evaluation.png
├── configs/
│   └── config.py                  # Pipeline paths, parameters & costs
├── src/
│   ├── api.py                     # FastAPI service & evaluation endpoints
│   ├── cases.py                   # Case telemetry, timeline & explanation logic
│   ├── data.py                    # Multi-scenario synthetic transaction generator
│   ├── features.py                # Causal 24h bipartite graph feature extractor
│   ├── evaluate.py                # Multi-seed audit & evaluation suite
│   ├── model_0.py                 # Naive single-signal heuristic baseline evaluation
│   ├── train.py                   # Model training & threshold selection
│   └── static/
│       ├── index.html             # Risk Investigation Workspace
│       ├── styles.css             # Dark slate visual design system
│       ├── app.js                 # Workspace logic, 3D WebGL & 2D canvas fallback
│       └── vendor/
│           └── 3d-force-graph.min.js
└── tests/
    ├── test_graph.py              # Zero-leakage temporal regression tests
    ├── test_model_0.py            # Model 0 deterministic validation & test assertions
    ├── test_p2_dashboard_api.py   # API contracts, Case C values & safety tests
    └── test_smoke.py              # Core endpoint smoke tests
```

---

## License

Copyright © 2026 Arnav Jain.  
All rights reserved.

See [LICENSE](file:///c:/Learning/College/Others/Hackathon/Razorpay/Project/abuse-ring-sentinel/LICENSE) for the full terms.
