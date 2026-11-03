from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn

from tee_engine import TEEMarketEngine
from chain_sig import NEARChainSignatureService

app = FastAPI(
    title="PredicTEE Core Agent API",
    description="Confidential AI Agent Engine for Cross-Chain Prediction Markets on NEAR",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tee_engine = TEEMarketEngine()
chain_sig_service = NEARChainSignatureService()

MOCK_MARKETS = [
    {
        "id": "pm-fed-dec-2026",
        "title": "Fed Rate Decision in December 2026: 25 bps Hike?",
        "category": "Macro & Fed",
        "volume_usd": "$24,850,000",
        "end_date": "2026-12-16",
        "market_prob": 0.38,
        "token_id_yes": "0x4f128c71b690e84b5e28a9c80d4e3b1c",
        "token_id_no": "0x5a239d82c701f95c6f39b0d91e5f4c2d",
        "evidence_sources": [
            {"name": "FedWatch Futures Curve", "weight": 0.45, "stance": "Hawkish bias post 10-2 FOMC dissent"},
            {"name": "Core PCE Print (Sep)", "weight": 0.30, "stance": "0.3% MoM sticky inflation reading"},
            {"name": "Chair Warsh Press Conference Transcript", "weight": 0.25, "stance": "Data-dependent, open to tightening"}
        ]
    },
    {
        "id": "pm-sol-300-eoy",
        "title": "Will Solana (SOL) Reach $300 Before End of Year?",
        "category": "Crypto Milestones",
        "volume_usd": "$18,420,000",
        "end_date": "2026-12-31",
        "market_prob": 0.42,
        "token_id_yes": "0x7b340e91d823a07f8a41c2e03f7a6e4b",
        "token_id_no": "0x8c451f02e934b18a9b52d3f14a8b7f5c",
        "evidence_sources": [
            {"name": "Spot SOL ETF Net Weekly Inflows", "weight": 0.40, "stance": "Accelerating institutional allocation"},
            {"name": "Total Supply Valuation Metric (6.5B cap)", "weight": 0.35, "stance": "Requires $195B market cap consolidation"},
            {"name": "DEX Daily Volume & Fee Burn Pace", "weight": 0.25, "stance": "High organic fee burn sustaining momentum"}
        ]
    },
    {
        "id": "pm-deepseek-v4-bench",
        "title": "Will DeepSeek-V4 Outperform Claude 3.7 / GPT-5 on SWE-Bench?",
        "category": "AI Benchmarks",
        "volume_usd": "$9,750,000",
        "end_date": "2026-11-30",
        "market_prob": 0.61,
        "token_id_yes": "0x9d562a13f045c29b0c63e4a25b9c8a6d",
        "token_id_no": "0x0e673b24a156d30c1d74f5b36c0d9b7e",
        "evidence_sources": [
            {"name": "Arxiv Preprints & MoE Architecture Leaks", "weight": 0.50, "stance": "Significant multi-token prediction improvements"},
            {"name": "GitHub Open Source Commits", "weight": 0.30, "stance": "Active tensor parallelism optimizations"},
            {"name": "NEAR AI Cloud Model Serving Benchmark", "weight": 0.20, "stance": "Sub-millisecond confidential inference speeds"}
        ]
    },
    {
        "id": "pm-near-ai-agent-volume",
        "title": "NEAR AI Daily Agent On-Chain Volume Exceed $100M in Q4?",
        "category": "NEAR Ecosystem",
        "volume_usd": "$4,300,000",
        "end_date": "2026-12-31",
        "market_prob": 0.29,
        "token_id_yes": "0x1f784c35b267e41d2e85a6c47d1e0c8f",
        "token_id_no": "0x2a895d46c378f52e3f96b7d58e2f1d9a",
        "evidence_sources": [
            {"name": "Chain Signatures MPC Daily Sign Counts", "weight": 0.45, "stance": "Exponential growth across cross-chain bots"},
            {"name": "NEAR Intents Daily Settlement Volume", "weight": 0.35, "stance": "High solver adoption for gasless swaps"},
            {"name": "User-Owned AI Hackathon Submissions", "weight": 0.20, "stance": "13 tracks driving agent deployment influx"}
        ]
    }
]

class CreateIntentRequest(BaseModel):
    near_account_id: str
    market_id: str
    side: str # "BUY_YES" or "BUY_NO"
    amount_usd: float
    limit_price: float
    tee_attestation_hash: str

class ExecuteIntentRequest(BaseModel):
    intent: Dict[str, Any]

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "tee_hardware": "Intel TDX / NVIDIA Confidential Computing",
        "near_network": "mainnet",
        "mpc_signer": "v1.signer",
        "version": "1.0.0"
    }

@app.get("/api/markets")
def list_markets():
    enriched = []
    for m in MOCK_MARKETS:
        analysis = tee_engine.evaluate_market(m)
        enriched.append({
            **m,
            "ai_analysis": analysis
        })
    return {"markets": enriched}

@app.get("/api/market/{market_id}")
def get_market(market_id: str):
    market = next((m for m in MOCK_MARKETS if m["id"] == market_id), None)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    analysis = tee_engine.evaluate_market(market)
    return {
        "market": market,
        "ai_analysis": analysis
    }

@app.post("/api/intent/create")
def create_betting_intent(req: CreateIntentRequest):
    market = next((m for m in MOCK_MARKETS if m["id"] == req.market_id), None)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    
    token_id = market["token_id_yes"] if req.side == "BUY_YES" else market["token_id_no"]
    intent = chain_sig_service.build_polymarket_order_intent(
        near_account_id=req.near_account_id,
        market_id=req.market_id,
        token_id=token_id,
        side=req.side,
        amount_usd=req.amount_usd,
        limit_price=req.limit_price,
        tee_attestation_hash=req.tee_attestation_hash
    )
    return {"intent": intent}

@app.post("/api/intent/execute")
def execute_betting_intent(req: ExecuteIntentRequest):
    executed = chain_sig_service.simulate_mpc_signing(req.intent)
    return {"executed_order": executed}

if __name__ == "__main__":
    uvicorn.run("agent:app", host="127.0.0.1", port=8000, reload=True)
