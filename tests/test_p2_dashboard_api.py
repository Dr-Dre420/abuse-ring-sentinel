import pytest
from fastapi.testclient import TestClient
from src.api import app

client = TestClient(app)

def test_health_endpoint():
    """Verify /health responds with 200 and healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "1.0.0"
    assert "model_B" in data["models"]
    assert "model_C" in data["models"]

def test_demo_list_endpoint():
    """Verify /case/demo/list returns the 3 required demo cases."""
    response = client.get("/case/demo/list")
    assert response.status_code == 200
    cases = response.json().get("cases", [])
    assert len(cases) == 3
    txn_ids = [c["txn_id"] for c in cases]
    assert "T57997" in txn_ids  # Case A
    assert "T59899" in txn_ids  # Case B
    assert "T60698" in txn_ids  # Case C

def test_case_a_coordinated_burst():
    """Verify Case A (T57997) loads, is flagged as abuse, and has graph relations."""
    response = client.get("/case/T57997")
    assert response.status_code == 200
    data = response.json()
    assert data["txn_id"] == "T57997"
    assert data["is_abuse_ground_truth"] == 1
    assert data["model_B"]["prediction"] == 1
    assert data["model_B"]["risk_score"] >= 0.70
    assert data["recommendation"]["action"] in ["Escalate", "Escalate for analyst authorization"]
    assert data["recommendation"]["reversible"] is True

    # Graph check
    nodes = data["graph"]["nodes"]
    assert len(nodes) > 0
    focal_nodes = [n for n in nodes if n.get("is_focal")]
    assert len(focal_nodes) == 1

def test_case_b_merchant_ring():
    """Verify Case B (T59899) loads, is flagged as abuse, and has collusion signals."""
    response = client.get("/case/T59899")
    assert response.status_code == 200
    data = response.json()
    assert data["txn_id"] == "T59899"
    assert data["is_abuse_ground_truth"] == 1
    assert data["model_B"]["prediction"] == 1
    assert data["recommendation"]["action"] in ["Escalate", "Escalate for analyst authorization", "Analyst review"]

def test_case_c_seasonal_false_alarm_suppressed():
    """
    Verify Case C (T60698) is legitimate, Model C flagged it (FP),
    but Model B cleared it (TN) via graph dispersion, yielding a 'Monitor' recommendation.
    """
    response = client.get("/case/T60698")
    assert response.status_code == 200
    data = response.json()
    assert data["txn_id"] == "T60698"
    assert data["is_abuse_ground_truth"] == 0
    assert data["model_C"]["prediction"] == 1  # Model C flagged due to temporal burst
    assert data["model_B"]["prediction"] == 0  # Model B cleared via relational context
    assert data["model_B"]["risk_score"] < data["model_B"]["threshold"]
    assert data["delta_analysis"]["graph_impact"] == "Suppressed False Alarm"
    assert data["recommendation"]["action"] == "Monitor"
    assert data["recommendation"]["reversible"] is True

def test_case_not_found():
    """Verify non-existent transaction returns 404."""
    response = client.get("/case/T999999999")
    assert response.status_code == 404

def test_score_batch_endpoint():
    """Verify /score/batch scores input features correctly."""
    payload = {
        "transactions": [
            {
                "txn_id": "TEST_1",
                "merchant_velocity_1h": 35.0,
                "shared_device_customers_24h": 15.0,
                "shared_pm_customers_24h": 8.0,
                "burst_score": 0.25,
                "txn_count_5m": 5.0,
                "txn_count_1h": 12.0,
                "two_hop_customer_count_24h": 30.0,
                "local_cluster_density_24h": 0.15,
                "amount_ratio_vs_customer": 1.2
            },
            {
                "txn_id": "TEST_2",
                "merchant_velocity_1h": 1.0,
                "shared_device_customers_24h": 0.0,
                "shared_pm_customers_24h": 0.0,
                "burst_score": 0.05,
                "txn_count_5m": 0.0,
                "txn_count_1h": 1.0,
                "two_hop_customer_count_24h": 0.0,
                "local_cluster_density_24h": 0.0,
                "amount_ratio_vs_customer": 1.0
            }
        ]
    }
    response = client.post("/score/batch", json=payload)
    assert response.status_code == 200
    res = response.json()
    assert res["count"] == 2
    results = res["results"]
    assert results[0]["risk_score_graph"] > 0.50
    assert results[0]["flagged_graph"] == 1
    assert results[1]["risk_score_graph"] < 0.20
    assert results[1]["flagged_graph"] == 0

def test_evaluate_endpoint():
    """Verify /evaluate returns multi-seed data, disclaimer, PR curves, and scenarios."""
    response = client.get("/evaluate")
    assert response.status_code == 200
    data = response.json()

    # Required framing
    assert "Synthetic evaluation" in data["framing"]["disclaimer"]

    # Multi-seed aggregate
    aggr = data["aggregate_comparison"]
    assert "model_B" in aggr
    assert "model_C" in aggr
    assert aggr["model_B"]["pr_auc"] >= 0.95
    assert aggr["model_C"]["pr_auc"] >= 0.95

    # Seed sensitivity
    seeds = data["seed_sensitivity"]
    assert len(seeds) == 3
    seed_nums = [s["seed"] for s in seeds]
    assert 42 in seed_nums
    assert 100 in seed_nums
    assert 999 in seed_nums

    # PR curves & confusion matrices
    assert "model_B" in data["pr_curves"]
    assert "model_C" in data["pr_curves"]
    assert "model_B" in data["held_out_confusion_matrices"]
    assert "model_C" in data["held_out_confusion_matrices"]

    # Scenario performance
    scenarios = data["scenario_performance"]
    assert len(scenarios) == 4

def test_strictly_reversible_defensive_policy():
    """Verify that only defensive, reversible actions are ever emitted."""
    allowed_actions = {"Monitor", "Analyst review", "Escalate", "Escalate for analyst authorization"}
    for cid in ["T57997", "T59899", "T60698"]:
        res = client.get(f"/case/{cid}").json()
        rec = res["recommendation"]
        assert rec["action"] in allowed_actions
        assert rec["reversible"] is True
        # Ensure no forbidden terms
        forbidden = ["terminate account", "permanent ban", "cancel card", "offensive"]
        for term in forbidden:
            assert term not in rec["guidance"].lower()

def test_investigation_timeline_deterministic():
    """Verify that /case/{txn_id} returns a deterministic 24-hour timeline derived from real events."""
    for cid in ["T57997", "T59899", "T60698"]:
        res = client.get(f"/case/{cid}")
        assert res.status_code == 200
        data = res.json()
        assert "timeline" in data
        timeline = data["timeline"]
        assert len(timeline) == 5
        offsets = [node["offset"] for node in timeline]
        assert offsets == ["T - 24h", "T - 12h", "T - 6h", "T - 1h", "T0"]
        for node in timeline:
            assert "time" in node
            assert "date" in node
            assert "title" in node
            assert "detail" in node
            assert node["status"] in ["info", "warning", "danger", "success"]

def test_case_c_calibrated_disagreement_explanation():
    """Verify Case C provides calibrated evidence-based explanation without overclaiming."""
    res = client.get("/case/T60698")
    assert res.status_code == 200
    data = res.json()
    delta = data["delta_analysis"]
    assert delta["graph_impact"] == "Suppressed False Alarm"
    assert "explanation" in delta
    expl = delta["explanation"]
    assert "temporal model detected an unusual burst" in expl.lower()
    assert "broadly distributed" in expl.lower()
    # Ensure no overclaiming forbidden words
    for forbidden in ["proved", "confirmed no fraud", "eliminated the risk", "overruled"]:
        assert forbidden not in expl.lower()

