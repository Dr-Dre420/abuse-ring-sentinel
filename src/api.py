import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.cases import get_case_details, score_batch, get_evaluation_summary, DEMO_CASE_IDS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

app = FastAPI(
    title="Abuse-Ring Sentinel API",
    description="Defensive payment abuse ring detector: Temporal behavioral signals enhanced by a 24-hour causal relational graph.",
    version="1.0.0"
)

# Enable CORS for external judge consumption if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreBatchRequest(BaseModel):
    transactions: List[Dict[str, Any]]


@app.get("/health")
def health():
    """
    Health check endpoint returning system status and model readiness.
    """
    return {
        "status": "healthy",
        "service": "abuse-ring-sentinel",
        "version": "1.0.0",
        "defense_only": True,
        "automated_financial_action": False,
        "methodology": "frozen_p1_7",
        "models": {
            "model_B": "XGBoost + Temporal + Graph",
            "model_C": "XGBoost + Temporal Only"
        }
    }


@app.get("/case/{txn_id}")
def get_case(txn_id: str):
    """
    Case Investigator endpoint: Fetches full transaction details,
    risk scores for both models, deterministic explainability reasons,
    defensive recommendation, and the causal 24h ego-network graph.
    """
    case = get_case_details(txn_id)
    if case is None:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction ID '{txn_id}' not found in the dataset."
        )
    return case


@app.get("/case/demo/list")
def list_demo_cases():
    """
    Returns curated demo cases for quick analyst/judge evaluation.
    """
    return {
        "cases": [
            {"key": "A", "txn_id": DEMO_CASE_IDS["A"], "label": "Case A: Coordinated Burst Abuse (Flagged High Risk)"},
            {"key": "B", "txn_id": DEMO_CASE_IDS["B"], "label": "Case B: Merchant-Ring Collusion (Flagged High Risk)"},
            {"key": "C", "txn_id": DEMO_CASE_IDS["C"], "label": "Case C: Legitimate Seasonal Burst (False Alarm Suppressed)"}
        ]
    }


@app.post("/score/batch")
def score_transactions(payload: ScoreBatchRequest):
    """
    Batch scoring endpoint: Scores feature vectors using Model B (Graph-enhanced)
    and Model C (Temporal-only) with deterministic explanations and defensive actions.
    """
    if not payload.transactions:
        raise HTTPException(status_code=400, detail="Transactions list cannot be empty.")
    
    scored = score_batch(payload.transactions)
    return {
        "count": len(scored),
        "results": scored
    }


@app.get("/evaluate")
def evaluate():
    """
    Model Evaluation endpoint: Returns transparent multi-seed metrics,
    seed sensitivity (42, 100, 999), PR curves, confusion matrices,
    scenario performance, and cost comparisons.
    """
    return get_evaluation_summary()


# Mount static frontend directory if it exists
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def serve_dashboard():
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse({"message": "Abuse-Ring Sentinel API active. Static dashboard building in progress."})
