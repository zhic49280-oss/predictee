from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import requests
import json
import time
import uvicorn

from tee_engine import TEEMarketEngine
from chain_sig import NEARChainSignatureService

app = FastAPI(
    title="PredicTEE Core Agent API - Verifiable TEE AI Oracle on NEAR",
    description="Confidential TEE AI Oracle & Cross-Chain Prediction Engine powered by NEAR AI Cloud & Chain Signatures",
    version="2.0.0"
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

STATE_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_state.json")

# Whitelisted hardware enclaves mirroring PredicTEE smart contract
# Measurements & ECDSA signing_address values verified from https://cloud-api.near.ai/v1/attestation/report
ENCLAVES_DB: Dict[str, Dict[str, Any]] = {
    TEEMarketEngine.INTEL_TDX_MEASUREMENT: {
        "id": "enc-intel-tdx",
        "measurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
        "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.INTEL_TDX_MEASUREMENT],
        "label": "NEAR AI Cloud Intel TDX Enclave TD10 (z-ai/glm-5.3-flash TEE)",
        "hardware": "Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)",
        "model": "z-ai/glm-5.3-flash (NEAR AI Cloud TEE)",
        "active": True,
        "registeredAt": "1730590000000000000",
        "uptime": "99.98%",
        "attestationType": "Intel TDX Quote v4.0 / DCAP + NVIDIA NRAS",
        "isolationGuarantee": "Hardware-enforced TDX memory encryption; report_data[0..32] binds enclave ECDSA signing_address."
    },
    TEEMarketEngine.NVIDIA_H100_MEASUREMENT: {
        "id": "enc-nvidia-h100",
        "measurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT,
        "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.NVIDIA_H100_MEASUREMENT],
        "label": "NEAR AI Cloud NVIDIA H100 Confidential GPU Enclave (Qwen/Qwen3.8-27B TEE)",
        "hardware": "NVIDIA H100 SXM5 80GB (Confidential Computing NRAS Verified)",
        "model": "Qwen/Qwen3.8-27B & Qwen/Qwen3.6-35B-A3B-FP8 (NEAR AI Cloud TEE)",
        "active": True,
        "registeredAt": "1730590000000000000",
        "uptime": "99.95%",
        "attestationType": "NVIDIA NRAS v3 GPU Attestation + Intel TDX RTMR0",
        "isolationGuarantee": "Isolated GPU VRAM execution verified via NVIDIA Remote Attestation Service (NRAS)."
    },
    TEEMarketEngine.PHALA_DSTACK_MEASUREMENT: {
        "id": "enc-phala-dstack",
        "measurement": TEEMarketEngine.PHALA_DSTACK_MEASUREMENT,
        "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.PHALA_DSTACK_MEASUREMENT],
        "label": "NEAR AI Cloud Phala / Dstack Compose-Manager Gateway TEE",
        "hardware": "Dstack Compose-Manager TDX Gateway Enclave",
        "model": "cloud-api.near.ai Gateway & Compose-Manager Verifier",
        "active": True,
        "registeredAt": "1730590000000000000",
        "uptime": "100.0%",
        "attestationType": "Dstack Compose-Manager Canonical Actions SHA-256 + TDX Quote",
        "isolationGuarantee": "Verifiable container image digest provenance via Sigstore and canonical compose actions_hash."
    }
}

# In-memory storage for Oracle requests & resolutions
REQUESTS_DB: Dict[str, Dict[str, Any]] = {}
RESOLUTIONS_DB: Dict[str, Dict[str, Any]] = {}
TOTAL_BOUNTIES_PAID_YOCTO = 0
REQUEST_NONCE = 0

def save_persisted_state():
    if os.getenv("PREDICTEE_TEST_MODE") == "1":
        return
    try:
        payload = {
            "request_nonce": REQUEST_NONCE,
            "total_bounties_paid_yocto": str(TOTAL_BOUNTIES_PAID_YOCTO),
            "requests": REQUESTS_DB,
            "resolutions": RESOLUTIONS_DB
        }
        with open(STATE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception as e:
        print(f"[State Persistence] Warning: Could not save state: {e}")

def init_seed_data():
    global REQUEST_NONCE, TOTAL_BOUNTIES_PAID_YOCTO
    REQUESTS_DB.clear()
    RESOLUTIONS_DB.clear()
    TOTAL_BOUNTIES_PAID_YOCTO = 0

    if os.getenv("PREDICTEE_TEST_MODE") != "1" and os.path.exists(STATE_FILE_PATH):
        try:
            with open(STATE_FILE_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            saved_reqs = saved.get("requests", {})
            saved_res = saved.get("resolutions", {})
            valid_schema = (
                len(saved_reqs) >= 6
                and all(
                    r.get("enclaveMeasurement") in ENCLAVES_DB
                    and r.get("signerAddress")
                    and r.get("ecdsaSignature")
                    for r in saved_res.values()
                )
            )
            if valid_schema:
                REQUESTS_DB.update(saved_reqs)
                RESOLUTIONS_DB.update(saved_res)
                REQUEST_NONCE = int(saved.get("request_nonce", len(REQUESTS_DB)))
                TOTAL_BOUNTIES_PAID_YOCTO = int(saved.get("total_bounties_paid_yocto", 0))
                return
        except Exception as e:
            print(f"[State Persistence] Resetting to default seeds due to: {e}")

    quote_req1 = tee_engine.generate_attestation_quote(
        target_id="req-1",
        model="z-ai/glm-5.3-flash",
        prompt_hash="8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
        result_hash="3f9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f",
        enclave_measurement=TEEMarketEngine.INTEL_TDX_MEASUREMENT
    )
    quote_req2 = tee_engine.generate_attestation_quote(
        target_id="req-2",
        model="Qwen/Qwen3.8-27B",
        prompt_hash="1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        result_hash="7c8b9a0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
        enclave_measurement=TEEMarketEngine.NVIDIA_H100_MEASUREMENT
    )
    quote_req4 = tee_engine.generate_attestation_quote(
        target_id="req-4",
        model="z-ai/glm-5.3-flash",
        prompt_hash="6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
        result_hash="2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
        enclave_measurement=TEEMarketEngine.INTEL_TDX_MEASUREMENT
    )

    seeds = [
        {
            "requestId": "req-1",
            "requester": "vitalik.near",
            "query": "Will the Federal Reserve cut interest rates by 25 bps in December 2026?",
            "category": "Macro & Fed",
            "bountyNear": 2.5,
            "bountyYocto": str(int(2.5 * 10**24)),
            "status": "RESOLVED",
            "createdAt": "1730592000000000000",
            "resolvedAt": "1730595600000000000",
            "callbackContract": "polymarket-oracle-bridge.near",
            "callbackMethod": "receive_resolution",
            "evidenceSources": [
                {"name": "CME FedWatch Futures Curve", "weight": 0.40, "stance": "84% pause priced in"},
                {"name": "Core PCE Print", "weight": 0.35, "stance": "0.3% MoM sticky inflation reading"},
                {"name": "FOMC Minutes Sentiment", "weight": 0.25, "stance": "Open to tightening if needed"}
            ],
            "resolution": {
                "requestId": "req-1",
                "outcome": "NO",
                "confidenceBps": 8950,
                "attestationHash": quote_req1["attestation_hash"],
                "enclaveMeasurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
                "evidenceDigest": "0x8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
                "signerAddress": quote_req1["attested_signing_address"],
                "activeSignerAddress": quote_req1["signer_address"],
                "signedText": quote_req1["signed_text"],
                "ecdsaSignature": quote_req1["ecdsa_signature"],
                "verificationMode": quote_req1["verification_mode"],
                "resolver": "tee-node-intel-01.near",
                "resolvedAt": "1730595600000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.INTEL_TDX_MEASUREMENT]["hardware"],
                "model": "z-ai/glm-5.3-flash",
                "attestationQuoteB64": quote_req1["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req1["zero_knowledge_log_guarantee"],
                "rationale": "CME FedWatch futures price an 84% probability of a policy hold following persistent Core PCE print (0.3% MoM).",
                "evidenceSources": [
                    {"name": "CME FedWatch Futures Curve", "weight": 0.40, "stance": "84% pause priced in"},
                    {"name": "Core PCE Print", "weight": 0.35, "stance": "0.3% MoM sticky inflation reading"},
                    {"name": "FOMC Minutes Sentiment", "weight": 0.25, "stance": "Open to tightening if needed"}
                ]
            }
        },
        {
            "requestId": "req-2",
            "requester": "illia.near",
            "query": "Will DeepSeek-V4 achieve top-1 rank on LMSYS Chatbot Arena before Dec 2026?",
            "category": "AI Benchmarks",
            "bountyNear": 5.0,
            "bountyYocto": str(int(5.0 * 10**24)),
            "status": "RESOLVED",
            "createdAt": "1730593000000000000",
            "resolvedAt": "1730596000000000000",
            "callbackContract": None,
            "callbackMethod": None,
            "evidenceSources": [
                {"name": "ArXiv MoE & Multimodal Architecture Peer Repositories", "weight": 0.45, "stance": "Pass@1 benchmark convergence"},
                {"name": "NEAR AI Cloud Confidential Inference Telemetry", "weight": 0.30, "stance": "Sub-2.4ms per token confirmed"},
                {"name": "Hugging Face Open LLM Leaderboard Automated Replication", "weight": 0.25, "stance": "Top percentile replication"}
            ],
            "resolution": {
                "requestId": "req-2",
                "outcome": "YES",
                "confidenceBps": 9240,
                "attestationHash": quote_req2["attestation_hash"],
                "enclaveMeasurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT,
                "evidenceDigest": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
                "signerAddress": quote_req2["attested_signing_address"],
                "activeSignerAddress": quote_req2["signer_address"],
                "signedText": quote_req2["signed_text"],
                "ecdsaSignature": quote_req2["ecdsa_signature"],
                "verificationMode": quote_req2["verification_mode"],
                "resolver": "tee-node-h100-01.near",
                "resolvedAt": "1730596000000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.NVIDIA_H100_MEASUREMENT]["hardware"],
                "model": "Qwen/Qwen3.8-27B",
                "attestationQuoteB64": quote_req2["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req2["zero_knowledge_log_guarantee"],
                "rationale": "Peer-reviewed MoE preprints and verifiable benchmark runs indicate +4.8 ELO advantage over incumbent models.",
                "evidenceSources": [
                    {"name": "ArXiv MoE & Multimodal Architecture Peer Repositories", "weight": 0.45, "stance": "Pass@1 benchmark convergence"},
                    {"name": "NEAR AI Cloud Confidential Inference Telemetry", "weight": 0.30, "stance": "Sub-2.4ms per token confirmed"},
                    {"name": "Hugging Face Open LLM Leaderboard Automated Replication", "weight": 0.25, "stance": "Top percentile replication"}
                ]
            }
        },
        {
            "requestId": "req-3",
            "requester": "sam.near",
            "query": "Will OpenAI release GPT-5 or Orion publicly before March 31, 2027?",
            "category": "AI Benchmarks",
            "bountyNear": 7.5,
            "bountyYocto": str(int(7.5 * 10**24)),
            "status": "PENDING",
            "createdAt": "1730602000000000000",
            "resolvedAt": None,
            "callbackContract": "polymarket-oracle-bridge.near",
            "callbackMethod": "receive_resolution",
            "evidenceSources": [
                {"name": "OpenAI Official Blog & Newsroom", "weight": 0.40, "stance": "Next-gen frontier models in alignment red-teaming"},
                {"name": "USPTO Trademark & Copyright Filings", "weight": 0.35, "stance": "GPT-5 commercial trademark registrations active"},
                {"name": "OpenAI API Public Endpoint Tracker", "weight": 0.25, "stance": "Staging model endpoints detected"}
            ],
            "resolution": None
        },
        {
            "requestId": "req-4",
            "requester": "alex.near",
            "query": "Will NEAR Chain Signatures settle over 100,000 cross-chain transactions daily in Q4 2026?",
            "category": "NEAR Ecosystem",
            "bountyNear": 2.0,
            "bountyYocto": str(int(2.0 * 10**24)),
            "status": "RESOLVED",
            "createdAt": "1730595000000000000",
            "resolvedAt": "1730598000000000000",
            "callbackContract": None,
            "callbackMethod": None,
            "evidenceSources": [
                {"name": "NEAR Chain Signatures MPC Daily Sign Counts", "weight": 0.45, "stance": "Exceeding 120k threshold"},
                {"name": "NEAR Intents Settlement Engine Solver Flow", "weight": 0.35, "stance": "High fill rate across solvers"},
                {"name": "Fast NEAR Protocol RPC Active Account Index", "weight": 0.20, "stance": "High daily growth rate"}
            ],
            "resolution": {
                "requestId": "req-4",
                "outcome": "YES",
                "confidenceBps": 9620,
                "attestationHash": quote_req4["attestation_hash"],
                "enclaveMeasurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
                "evidenceDigest": "0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
                "signerAddress": quote_req4["attested_signing_address"],
                "activeSignerAddress": quote_req4["signer_address"],
                "signedText": quote_req4["signed_text"],
                "ecdsaSignature": quote_req4["ecdsa_signature"],
                "verificationMode": quote_req4["verification_mode"],
                "resolver": "tee-node-intel-02.near",
                "resolvedAt": "1730598000000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.INTEL_TDX_MEASUREMENT]["hardware"],
                "model": "z-ai/glm-5.3-flash",
                "attestationQuoteB64": quote_req4["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req4["zero_knowledge_log_guarantee"],
                "rationale": "Fast Near RPC telemetry and MPC signer key activity log over 120,000 daily signatures across Polygon, Bitcoin, and Arbitrum.",
                "evidenceSources": [
                    {"name": "NEAR Chain Signatures MPC Daily Sign Counts", "weight": 0.45, "stance": "Exceeding 120k threshold"},
                    {"name": "NEAR Intents Settlement Engine Solver Flow", "weight": 0.35, "stance": "High fill rate across solvers"},
                    {"name": "Fast NEAR Protocol RPC Active Account Index", "weight": 0.20, "stance": "High daily growth rate"}
                ]
            }
        },
        {
            "requestId": "req-5",
            "requester": "bob.near",
            "query": "Will US Headline CPI for October 2026 print below 2.4% annualized?",
            "category": "Macro & Fed",
            "bountyNear": 1.5,
            "bountyYocto": str(int(1.5 * 10**24)),
            "status": "PENDING",
            "createdAt": "1730600000000000000",
            "resolvedAt": None,
            "callbackContract": None,
            "callbackMethod": None,
            "evidenceSources": tee_engine._synthesize_evidence_feeds(
                "Will US Headline CPI for October 2026 print below 2.4% annualized?",
                "Macro & Fed"
            ),
            "resolution": None
        },
        {
            "requestId": "req-6",
            "requester": "carol.near",
            "query": "Will SpaceX Starship Flight 8 achieve successful booster catch and payload orbital insertion?",
            "category": "Global Events",
            "bountyNear": 4.0,
            "bountyYocto": str(int(4.0 * 10**24)),
            "status": "PENDING",
            "createdAt": "1730601000000000000",
            "resolvedAt": None,
            "callbackContract": "mars-bets.near",
            "callbackMethod": "payout_winners",
            "evidenceSources": tee_engine._synthesize_evidence_feeds(
                "Will SpaceX Starship Flight 8 achieve successful booster catch and payload orbital insertion?",
                "Global Events"
            ),
            "resolution": None
        }
    ]

    for seed in seeds:
        req_id = seed["requestId"]
        res = seed.get("resolution")
        req_item = {
            "requestId": req_id,
            "requester": seed["requester"],
            "query": seed["query"],
            "category": seed["category"],
            "bountyNear": seed["bountyNear"],
            "bountyYocto": seed["bountyYocto"],
            "status": seed["status"],
            "createdAt": seed["createdAt"],
            "resolvedAt": seed["resolvedAt"],
            "callbackContract": seed["callbackContract"],
            "callbackMethod": seed["callbackMethod"],
            "evidenceSources": seed.get("evidenceSources", [])
        }
        REQUESTS_DB[req_id] = req_item
        if res:
            RESOLUTIONS_DB[req_id] = res
            TOTAL_BOUNTIES_PAID_YOCTO += int(seed["bountyYocto"])

    REQUEST_NONCE = len(seeds)

init_seed_data()

# Fallback curated markets in case external Polymarket API has connection limits
FALLBACK_MARKETS = [
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

def fetch_live_polymarket_events() -> List[Dict[str, Any]]:
    """
    Fetches active, live high-volume events directly from Polymarket's public Gamma API.
    Transforms raw Polymarket orderbooks into PredicTEE market schemas.
    Parses clobTokenIds safely to prevent string indexing bugs.
    """
    try:
        url = "https://gamma-api.polymarket.com/events?closed=false&limit=8&order=volume24hr&ascending=false"
        resp = requests.get(url, timeout=4)
        if resp.status_code != 200:
            return FALLBACK_MARKETS

        events = resp.json()
        transformed = []
        for ev in events:
            markets = ev.get("markets", [])
            if not markets:
                continue

            # Select the main binary market in the event
            m = markets[0]
            outcome_prices = m.get("outcomePrices")
            prob = 0.5
            if outcome_prices:
                try:
                    if isinstance(outcome_prices, str):
                        prices = json.loads(outcome_prices)
                    else:
                        prices = outcome_prices
                    prob = float(prices[0]) if len(prices) > 0 else 0.5
                except Exception:
                    prob = 0.5

            volume_val = float(ev.get("volume24hr") or ev.get("volume") or 100000)
            vol_str = f"${volume_val / 1_000_000:.1f}M" if volume_val >= 1_000_000 else f"${volume_val / 1_000:.0f}K"

            # Safe parsing of clobTokenIds (handling both stringified JSON and lists)
            raw_tokens = m.get("clobTokenIds")
            clob_tokens = []
            if isinstance(raw_tokens, str):
                try:
                    clob_tokens = json.loads(raw_tokens)
                except Exception:
                    clob_tokens = ["0x1", "0x2"]
            elif isinstance(raw_tokens, list):
                clob_tokens = raw_tokens
            else:
                clob_tokens = ["0x1", "0x2"]

            if not clob_tokens:
                clob_tokens = ["0x1", "0x2"]

            token_yes = str(clob_tokens[0])
            token_no = str(clob_tokens[-1]) if len(clob_tokens) > 1 else str(clob_tokens[0])

            item = {
                "id": str(m.get("id") or ev.get("id")),
                "title": m.get("question") or ev.get("title"),
                "category": ev.get("category") or "Global Politics & Macro",
                "volume_usd": vol_str,
                "end_date": m.get("endDate") or "2026-12-31",
                "market_prob": round(prob, 2),
                "token_id_yes": token_yes,
                "token_id_no": token_no,
                "is_live_polymarket": True,
                "evidence_sources": [
                    {"name": "Live Polymarket Orderbook Flow", "weight": 0.40, "stance": f"24h Active volume {vol_str}"},
                    {"name": "Multi-Source News Synthesis", "weight": 0.35, "stance": "Aggregated Reuters / Bloomberg headlines"},
                    {"name": "On-Chain Smart Money Positioning", "weight": 0.25, "stance": "Whale wallet net delta tracking"}
                ]
            }
            transformed.append(item)

        return transformed if len(transformed) >= 2 else FALLBACK_MARKETS
    except Exception as e:
        print(f"Error fetching live Polymarket: {e}, using fallback.")
        return FALLBACK_MARKETS

# ==========================================
# Pydantic Request & Response Schemas
# ==========================================

class CreateIntentRequest(BaseModel):
    near_account_id: str
    market_id: str
    side: str # "BUY_YES" or "BUY_NO"
    amount_usd: float
    limit_price: float
    tee_attestation_hash: str

class ExecuteIntentRequest(BaseModel):
    intent: Dict[str, Any]

class CreateOracleRequestPayload(BaseModel):
    requester: str = Field(default="user.near", description="NEAR account ID submitting the oracle query")
    query: str = Field(..., description="Prediction query or proposition prompt to be resolved by TEE")
    category: str = Field(default="General", description="Category for contextual intelligence feeds")
    bounty_near: float = Field(default=1.0, description="Attached incentive bounty in NEAR tokens")
    callback_contract: Optional[str] = Field(default=None, description="Optional NEAR smart contract for automated callback")
    callback_method: Optional[str] = Field(default=None, description="Callback function to invoke upon resolution")

class ResolveOracleQueryPayload(BaseModel):
    request_id: Optional[str] = Field(default=None, description="ID of open request in database")
    query: Optional[str] = Field(default=None, description="Prompt if running an ad-hoc query")
    category: Optional[str] = Field(default="General", description="Topic category")
    enclave_measurement: Optional[str] = Field(default=None, description="Desired TEE enclave code measurement")
    market_context: Optional[Dict[str, Any]] = Field(default=None, description="Optional live market odds context")

class FulfillOraclePayload(BaseModel):
    request_id: str = Field(..., description="ID of request being resolved")
    outcome: str = Field(..., description="Determined resolution outcome, e.g. 'YES' or 'NO'")
    confidence_bps: int = Field(..., description="Confidence score in basis points (0-10000)")
    attestation_hash: str = Field(..., description="Cryptographic TEE hardware quote hash")
    enclave_measurement: str = Field(..., description="Measurement of resolving TEE enclave")
    evidence_digest: Optional[str] = Field(default="", description="Digest of synthesized feeds")
    signer_address: Optional[str] = Field(default=None, description="Verified ECDSA TEE signing_address (0x...)")
    signed_text: Optional[str] = Field(default=None, description="Canonical message or req_sha256:resp_sha256 signed by TEE")
    ecdsa_signature: Optional[str] = Field(default=None, description="65-byte EIP-191 ECDSA signature from TEE")
    verification_mode: Optional[str] = Field(default=None, description="LIVE_NEAR_AI_CLOUD_TEE or KEYLESS_ATTESTATION_SANDBOX_DEMO")
    resolver: Optional[str] = Field(default="tee-node-01.near", description="NEAR account of TEE resolver node")
    attestation_quote_b64: Optional[str] = Field(default=None, description="Base64 encoded hardware quote document")
    rationale: Optional[str] = Field(default=None, description="AI synthesis reasoning summary")
    evidence_sources: Optional[List[Dict[str, Any]]] = Field(default=None, description="Weighted evidence feeds")

class AIConfigPayload(BaseModel):
    api_key: str = Field(default="", description="Optional NEAR AI Cloud API Key (kept in memory only, never saved to disk)")
    base_url: Optional[str] = Field(default="https://cloud-api.near.ai/v1", description="NEAR AI Cloud Base URL")
    model: Optional[str] = Field(default="z-ai/glm-5.3-flash", description="Target NEAR AI Cloud TEE model identifier")

# ==========================================
# Core System Endpoints
# ==========================================

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "service": "PredicTEE Verifiable AI Oracle on NEAR",
        "tee_hardware": "Intel TDX TD10 & NVIDIA H100 Confidential Computing (NEAR AI Cloud)",
        "near_network": "mainnet",
        "mpc_signer": "v1.signer",
        "mpc_root_public_key": chain_sig_service.mpc_root_pubkey,
        "whitelisted_enclaves": len(ENCLAVES_DB),
        "ai_mode": (
            f"LIVE NEAR AI Cloud TEE ({tee_engine.near_ai_model})"
            if tee_engine.near_ai_api_key
            else "Keyless Live Hardware Attestation + Deterministic Sandbox Mode"
        ),
        "version": "2.0.0"
    }

@app.get("/api/config/ai")
def get_ai_config():
    return {
        "has_api_key": bool(tee_engine.near_ai_api_key),
        "base_url": tee_engine.near_ai_base_url,
        "model": tee_engine.near_ai_model,
        "supported_models": tee_engine.supported_models,
        "mode": (
            f"LIVE NEAR AI Cloud TEE ({tee_engine.near_ai_model})"
            if tee_engine.near_ai_api_key
            else "Keyless Live Hardware Attestation + Deterministic Sandbox Mode"
        )
    }

@app.get("/api/oracle/attestation/live")
def get_live_near_ai_attestation(model: Optional[str] = Query(default=None)):
    """
    Fetches & verifies a live hardware attestation report from the public keyless
    endpoint https://cloud-api.near.ai/v1/attestation/report (Intel TDX DCAP + nonce binding).
    """
    return tee_engine.fetch_live_near_ai_attestation(model=model)

@app.post("/api/config/ai")
def update_ai_config(payload: AIConfigPayload):
    return tee_engine.configure_ai_provider(
        api_key=payload.api_key,
        base_url=payload.base_url,
        model=payload.model
    )

@app.get("/api/accounts")
def list_accounts():
    """
    Returns NEAR accounts along with their deterministically derived Polygon MPC addresses via `v1.signer`.
    """
    base_accounts = [
        {"accountId": "alice.near", "nearBalance": "42.50 NEAR", "label": "Primary Hackathon Demo Wallet"},
        {"accountId": "bob.near", "nearBalance": "18.20 NEAR", "label": "Secondary Solver Agent"},
        {"accountId": "illia.near", "nearBalance": "150.00 NEAR", "label": "NEAR Ecosystem Foundation"}
    ]
    enriched = []
    for acc in base_accounts:
        enriched.append({
            **acc,
            "derivedPolygonAddress": chain_sig_service.derive_polygon_address(acc["accountId"])
        })
    return {"accounts": enriched}

# ==========================================
# NEAR Oracle REST Endpoints
# ==========================================

@app.get("/api/oracle/stats")
def get_oracle_stats():
    """
    Returns high-level statistics for the PredicTEE Oracle,
    mirroring the smart contract's `get_stats()` method.
    """
    total = len(REQUESTS_DB)
    resolved = sum(1 for r in REQUESTS_DB.values() if r["status"] == "RESOLVED")
    cancelled = sum(1 for r in REQUESTS_DB.values() if r["status"] == "CANCELLED")
    pending = sum(1 for r in REQUESTS_DB.values() if r["status"] == "PENDING")
    active_enclaves = sum(1 for e in ENCLAVES_DB.values() if e["active"])

    total_bounties_near = round(TOTAL_BOUNTIES_PAID_YOCTO / 10**24, 4)

    return {
        "totalRequests": total,
        "pendingCount": pending,
        "resolvedCount": resolved,
        "cancelledCount": cancelled,
        "totalBountiesPaidYocto": str(TOTAL_BOUNTIES_PAID_YOCTO),
        "totalBountiesPaidNear": total_bounties_near,
        "activeEnclavesCount": active_enclaves
    }

@app.get("/api/oracle/requests")
def list_oracle_requests(
    status: Optional[str] = Query(None, description="Filter by status: PENDING, RESOLVED, CANCELLED"),
    category: Optional[str] = Query(None, description="Filter by category"),
    from_index: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """
    Returns list of all registered oracle requests, enriched with resolution data if available.
    """
    filtered = []
    for req in REQUESTS_DB.values():
        if status and req["status"] != status.upper():
            continue
        if category and req["category"].lower() != category.lower():
            continue

        req_copy = dict(req)
        if not req_copy.get("evidenceSources"):
            req_copy["evidenceSources"] = tee_engine._synthesize_evidence_feeds(req_copy["query"], req_copy["category"])
        req_copy["resolution"] = RESOLUTIONS_DB.get(req["requestId"])
        filtered.append(req_copy)

    # Sort newest first
    filtered.sort(key=lambda x: str(x.get("createdAt", "")), reverse=True)
    paged = filtered[from_index : from_index + limit]

    return {
        "total": len(filtered),
        "from_index": from_index,
        "limit": limit,
        "requests": paged
    }

@app.get("/api/oracle/request/{request_id}")
def get_oracle_request(request_id: str):
    """
    Returns a single oracle request and its verified TEE resolution if resolved.
    """
    req = REQUESTS_DB.get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail=f"OracleRequest not found: {request_id}")

    res = RESOLUTIONS_DB.get(request_id)
    return {
        "request": req,
        "resolution": res
    }

@app.post("/api/oracle/request")
def create_oracle_request(payload: CreateOracleRequestPayload):
    """
    Submits a new prediction / resolution question to the PredicTEE network.
    Generates the corresponding NEAR on-chain transaction payload.
    """
    global REQUEST_NONCE
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if payload.bounty_near <= 0:
        raise HTTPException(status_code=400, detail="Bounty deposit must be greater than zero NEAR")

    REQUEST_NONCE += 1
    request_id = f"req-{REQUEST_NONCE}"
    bounty_yocto = str(int(payload.bounty_near * 10**24))
    created_at = str(int(time.time() * 1_000_000_000))
    evidence_sources = tee_engine._synthesize_evidence_feeds(payload.query.strip(), payload.category.strip())

    new_request = {
        "requestId": request_id,
        "requester": payload.requester.strip(),
        "query": payload.query.strip(),
        "category": payload.category.strip(),
        "bountyNear": float(payload.bounty_near),
        "bountyYocto": bounty_yocto,
        "status": "PENDING",
        "createdAt": created_at,
        "resolvedAt": None,
        "callbackContract": payload.callback_contract,
        "callbackMethod": payload.callback_method,
        "evidenceSources": evidence_sources
    }
    REQUESTS_DB[request_id] = new_request
    save_persisted_state()

    # Build NEAR transaction payload ready for user signing
    tx = chain_sig_service.build_request_resolution_tx(
        requester_account_id=payload.requester,
        query=payload.query,
        category=payload.category,
        bounty_near=payload.bounty_near,
        callback_contract=payload.callback_contract,
        callback_method=payload.callback_method
    )

    return {
        "success": True,
        "request": new_request,
        "transaction": tx
    }

@app.post("/api/oracle/resolve")
def resolve_oracle(payload: ResolveOracleQueryPayload):
    """
    Executes confidential AI inference inside a verified TEE enclave.
    Synthesizes multi-source evidence, computes confidence BPS,
    and returns a hardware-attested cryptographic quote.
    """
    query = payload.query
    category = payload.category or "General"

    if payload.request_id:
        req = REQUESTS_DB.get(payload.request_id)
        if not req:
            raise HTTPException(status_code=404, detail=f"OracleRequest not found: {payload.request_id}")
        query = req["query"]
        category = req["category"]

    if not query:
        raise HTTPException(status_code=400, detail="Must provide either request_id or query string")

    # Verify enclave measurement whitelist if custom one passed
    measurement = payload.enclave_measurement or TEEMarketEngine.CODE_MEASUREMENT
    if measurement not in ENCLAVES_DB:
        raise HTTPException(
            status_code=400,
            detail=f"Enclave measurement {measurement} not in verified whitelist"
        )

    # Run verifiable confidential reasoning in TEE
    analysis = tee_engine.resolve_oracle_query(
        query=query,
        category=category,
        market_context=payload.market_context,
        enclave_measurement=measurement
    )

    return {
        "request_id": payload.request_id,
        "query": query,
        "category": category,
        "outcome": analysis["outcome"],
        "confidence_bps": analysis["confidence_bps"],
        "alpha_divergence": analysis["alpha_divergence"],
        "rationale": analysis["rationale"],
        "evidence_sources": analysis["evidence_sources"],
        "evidence_digest": analysis["evidence_digest"],
        "tee_attestation": analysis["tee_attestation"]
    }

@app.post("/api/oracle/fulfill")
def fulfill_oracle(payload: FulfillOraclePayload):
    """
    Records a verified resolution on-chain, releases the bounty payout to the TEE resolver node,
    and returns the NEAR function call transaction.
    """
    global TOTAL_BOUNTIES_PAID_YOCTO

    req = REQUESTS_DB.get(payload.request_id)
    if not req:
        raise HTTPException(status_code=404, detail=f"OracleRequest not found: {payload.request_id}")
    if req["status"] != "PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"Request {payload.request_id} is not in PENDING state (status: {req['status']})"
        )

    # Enforce TEE enclave measurement check
    if payload.enclave_measurement not in ENCLAVES_DB:
        raise HTTPException(
            status_code=400,
            detail=f"Unverified TEE Hardware: Enclave measurement rejected ({payload.enclave_measurement})"
        )

    if not (0 <= payload.confidence_bps <= 10000):
        raise HTTPException(status_code=400, detail="confidence_bps must be between 0 and 10000")

    resolved_at = str(int(time.time() * 1_000_000_000))
    resolver_id = payload.resolver or "tee-node-intel-01.near"
    enclave_meta = ENCLAVES_DB[payload.enclave_measurement]
    enclave_model = "Qwen/Qwen3.8-27B" if payload.enclave_measurement == TEEMarketEngine.NVIDIA_H100_MEASUREMENT else "z-ai/glm-5.3-flash"

    generated_quote = tee_engine.generate_attestation_quote(
        target_id=payload.request_id,
        model=enclave_model,
        prompt_hash=payload.evidence_digest or "0x0",
        result_hash=payload.attestation_hash.strip(),
        enclave_measurement=payload.enclave_measurement
    )
    quote_b64 = payload.attestation_quote_b64 or generated_quote["attestation_quote_b64"]
    signer_address = payload.signer_address or enclave_meta.get("signingAddress") or generated_quote["attested_signing_address"]
    signed_text = payload.signed_text or generated_quote["signed_text"]
    ecdsa_signature = payload.ecdsa_signature or generated_quote["ecdsa_signature"]
    verification_mode = payload.verification_mode or generated_quote["verification_mode"]

    resolution = {
        "requestId": payload.request_id,
        "outcome": payload.outcome.strip(),
        "confidenceBps": payload.confidence_bps,
        "attestationHash": payload.attestation_hash.strip(),
        "enclaveMeasurement": payload.enclave_measurement,
        "evidenceDigest": payload.evidence_digest or "",
        "signerAddress": signer_address,
        "activeSignerAddress": generated_quote["signer_address"],
        "signedText": signed_text,
        "ecdsaSignature": ecdsa_signature,
        "verificationMode": verification_mode,
        "resolver": resolver_id,
        "resolvedAt": resolved_at,
        "hardware": enclave_meta.get("hardware", enclave_meta.get("label")),
        "model": enclave_model,
        "attestationQuoteB64": quote_b64,
        "zeroKnowledgeGuarantee": enclave_meta.get(
            "isolationGuarantee",
            "Hardware-verified memory encryption. No prompt or model state leakage."
        ),
        "rationale": payload.rationale or f"Verified TEE synthesis completed with {payload.confidence_bps / 100:.1f}% conviction.",
        "evidenceSources": payload.evidence_sources or req.get("evidenceSources", [])
    }

    # Update in-memory state and persist
    req["status"] = "RESOLVED"
    req["resolvedAt"] = resolved_at
    if payload.evidence_sources:
        req["evidenceSources"] = payload.evidence_sources
    RESOLUTIONS_DB[payload.request_id] = resolution

    bounty_yocto = int(req.get("bountyYocto", 0))
    TOTAL_BOUNTIES_PAID_YOCTO += bounty_yocto
    save_persisted_state()

    # Build NEAR on-chain transaction
    tx = chain_sig_service.build_fulfill_resolution_tx(
        resolver_account_id=resolver_id,
        request_id=payload.request_id,
        outcome=payload.outcome,
        confidence_bps=payload.confidence_bps,
        attestation_hash=payload.attestation_hash,
        enclave_measurement=payload.enclave_measurement,
        evidence_digest=payload.evidence_digest or "",
        signed_text=signed_text,
        ecdsa_signature=ecdsa_signature
    )

    return {
        "success": True,
        "resolution": resolution,
        "transaction": tx,
        "simulated_payout": {
            "resolver": resolver_id,
            "bounty_near": req.get("bountyNear", round(bounty_yocto / 10**24, 4)),
            "bounty_yocto": str(bounty_yocto)
        }
    }

@app.get("/api/oracle/enclaves")
def list_enclaves():
    """
    Returns registered TEE hardware enclaves and their dynamic resolution counts.
    """
    enclaves_list = []
    for measurement, enc in ENCLAVES_DB.items():
        resolved_by_enclave = sum(
            1 for r in RESOLUTIONS_DB.values() if r.get("enclaveMeasurement") == measurement
        )
        enclaves_list.append({
            **enc,
            "totalResolutions": resolved_by_enclave
        })
    return {
        "enclaves": enclaves_list
    }

# ==========================================
# Prediction Market Execution Endpoints (Backward Compatible)
# ==========================================

@app.get("/api/markets")
def list_markets():
    """Returns live Polymarket events enriched with TEE confidential AI evaluations."""
    raw_markets = fetch_live_polymarket_events()
    enriched = []
    for m in raw_markets:
        analysis = tee_engine.evaluate_market(m)
        enriched.append({
            **m,
            "ai_analysis": analysis
        })
    return {"markets": enriched}

@app.get("/api/market/{market_id}")
def get_market(market_id: str):
    raw_markets = fetch_live_polymarket_events()
    market = next((m for m in raw_markets if m["id"] == market_id), None)
    if not market:
        market = next((m for m in FALLBACK_MARKETS if m["id"] == market_id), None)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    analysis = tee_engine.evaluate_market(market)
    return {
        "market": market,
        "ai_analysis": analysis
    }

@app.post("/api/intent/create")
def create_betting_intent(req: CreateIntentRequest):
    raw_markets = fetch_live_polymarket_events()
    market = next((m for m in raw_markets if m["id"] == req.market_id), None)
    if not market:
        market = next((m for m in FALLBACK_MARKETS if m["id"] == req.market_id), None)
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
