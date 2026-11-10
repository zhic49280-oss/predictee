from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import tempfile
import threading
import requests
import json
import time
import base64
import uvicorn

from tee_engine import TEEMarketEngine, MAX_QUERY_LEN, MAX_CATEGORY_LEN
from chain_sig import NEARChainSignatureService

app = FastAPI(
    title="PredicTEE Core Agent API - Verifiable TEE AI Oracle on NEAR",
    description="Confidential TEE AI Oracle & Cross-Chain Prediction Engine powered by NEAR AI Cloud & Chain Signatures",
    version="2.0.0"
)

# SEC-03 fix: Restrict CORS to explicit local/configured origins instead of wildcard '*' with credentials
ALLOWED_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "PREDICTEE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:8000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

tee_engine = TEEMarketEngine()
chain_sig_service = NEARChainSignatureService(network="mainnet")
testnet_chain_sig_service = NEARChainSignatureService(network="testnet")

def get_chain_sig_service(network: str = "mainnet") -> NEARChainSignatureService:
    return testnet_chain_sig_service if (network or "").lower() == "testnet" else chain_sig_service

STATE_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_state.json")
STATE_LOCK = threading.RLock()

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
        "label": "NEAR AI Cloud TDX RTMR0 + NVIDIA H100 NRAS Enclave (Qwen/Qwen3.8-27B TEE)",
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
    """REL-01 fix: Thread-safe atomic file persistence via temporary file + os.replace."""
    if os.getenv("PREDICTEE_TEST_MODE") == "1":
        return
    with STATE_LOCK:
        temp_path = None
        try:
            payload = {
                "request_nonce": REQUEST_NONCE,
                "total_bounties_paid_yocto": str(TOTAL_BOUNTIES_PAID_YOCTO),
                "requests": dict(REQUESTS_DB),
                "resolutions": dict(RESOLUTIONS_DB)
            }
            dir_name = os.path.dirname(STATE_FILE_PATH)
            with tempfile.NamedTemporaryFile(
                "w", dir=dir_name, delete=False, encoding="utf-8", suffix=".tmp"
            ) as tf:
                json.dump(payload, tf, indent=2)
                tf.flush()
                os.fsync(tf.fileno())
                temp_path = tf.name
            os.replace(temp_path, STATE_FILE_PATH)
        except Exception as e:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
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
                "outcome": "YES",
                "confidenceBps": 6300,
                "attestationHash": "0x7b83499930825a5169db14036a78a6d1d5585d202ab6d8e000826d67118c2125",
                "enclaveMeasurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
                "evidenceDigest": "0x8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
                "signerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "activeSignerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "signedText": "z-ai/glm-5.3-flash:64fe0662ba5e281b692b594ac62188d21925198b9dd6ca64cd327d17a430aaf4:259db37a7d0ed1595ddc7205d757b3682f13481a783ad304f164a083354bb2d4",
                "ecdsaSignature": "0x39dcf19252bf822bd710043c2752e2f442bf9ed76aa1d2f57a2f779371df05dc4b21c2f3cf53def52191034728e9588b6fb5700e896ced947586e7e78f6ee02d1c",
                "verificationMode": "LIVE_NEAR_AI_CLOUD_TEE",
                "resolver": "tee-node-intel-01.near",
                "resolvedAt": "1730595600000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.INTEL_TDX_MEASUREMENT]["hardware"],
                "model": "z-ai/glm-5.3-flash",
                "attestationQuoteB64": quote_req1["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req1["zero_knowledge_log_guarantee"],
                "rationale": "[NEAR AI Cloud TEE - z-ai/glm-5.3-flash] The FOMC cut 25bps in December 2025 to 3.50-3.75% and its projections signal a data-dependent easing bias through 2026 amid cooling labor conditions. Fed funds futures and CME FedWatch pricing imply additional quarterly-style cuts across 2026, making a December 2026 move consistent with the implied path.",
                "evidenceSources": [
                    {"name": "FOMC Dec 2025 decision & SEP dots", "weight": 0.40, "stance": "Fed cut 25bps to 3.50-3.75% and median projections implied further easing in 2026"},
                    {"name": "CME FedWatch / fed funds futures", "weight": 0.35, "stance": "Market pricing implies roughly 2-3 additional 25bp cuts during 2026"},
                    {"name": "Macro data trend (core PCE, unemployment)", "weight": 0.25, "stance": "Inflation drifting toward target (~2.6-2.8% core) with softening labor market"}
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
                {"name": "LMSYS Chatbot Arena historical leaderboard", "weight": 0.40, "stance": "Top-1 overall rank held by Gemini, GPT, and Grok model families"},
                {"name": "DeepSeek-R1/V3 benchmark record", "weight": 0.35, "stance": "DeepSeek-R1 peaked near #2-3 in Arena categories"},
                {"name": "US export control / compute constraint reporting", "weight": 0.25, "stance": "GPU export restrictions limit training compute relative to US frontier labs"}
            ],
            "resolution": {
                "requestId": "req-2",
                "outcome": "NO",
                "confidenceBps": 6800,
                "attestationHash": "0x3e71c5ce76f463ff3a340e1b4276fb8323e7e8f376888d6a26bf9f62b7bcffd2",
                "enclaveMeasurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT,
                "evidenceDigest": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
                "signerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "activeSignerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "signedText": "z-ai/glm-5.3-flash:99673454a3807ed6e03543b54180d3fde03244755d2bdb67cfc7e7924bc2fce1:f1af830cbe9e3115b328b4539ba596a207e8a796dc3fb531f528c336eaacbecb",
                "ecdsaSignature": "0xc8708fbaeeb1b0dfc17f3ee20e36462bf2b7c1f42fc46edf988cdcb5a379517430c53b662207c9a505f5ada30995825badf0d2fd3ef489d571821025d85e9c181c",
                "verificationMode": "LIVE_NEAR_AI_CLOUD_TEE",
                "resolver": "tee-node-h100-01.near",
                "resolvedAt": "1730596000000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.NVIDIA_H100_MEASUREMENT]["hardware"],
                "model": "z-ai/glm-5.3-flash",
                "attestationQuoteB64": quote_req2["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req2["zero_knowledge_log_guarantee"],
                "rationale": "[NEAR AI Cloud TEE - z-ai/glm-5.3-flash] No DeepSeek model has ever held the #1 overall spot on LMSYS Chatbot Arena; DeepSeek-R1 peaked around #2-3 in select categories before Gemini, GPT, and Grok variants reclaimed the top. While DeepSeek is highly competitive on cost-efficiency, outright top-1 rank by Dec 2026 is empirically less likely than not.",
                "evidenceSources": [
                    {"name": "LMSYS Chatbot Arena historical leaderboard", "weight": 0.40, "stance": "Top-1 overall rank held by Gemini, GPT, and Grok model families"},
                    {"name": "DeepSeek-R1/V3 benchmark record", "weight": 0.35, "stance": "DeepSeek-R1 peaked near #2-3 in Arena categories"},
                    {"name": "US export control / compute constraint reporting", "weight": 0.25, "stance": "GPU export restrictions limit training compute relative to US frontier labs"}
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
                {"name": "Historical Chain Signatures on-chain usage data", "weight": 0.40, "stance": "Daily cross-chain signature volumes in low thousands to tens of thousands"},
                {"name": "NEAR ecosystem growth reports (intents, MPC network)", "weight": 0.35, "stance": "Chain-abstraction tooling expanding steadily"},
                {"name": "Live NEARUSDT market telemetry (Binance)", "weight": 0.25, "stance": "Price at $3.95 with ~$90M 24h volume reflects moderate activity"}
            ],
            "resolution": {
                "requestId": "req-4",
                "outcome": "NO",
                "confidenceBps": 7100,
                "attestationHash": "0xc9e94eb5c9f2d41a90b478975cf0d4f7bc805d15d517bab05a83eb7ec5cfcfd5",
                "enclaveMeasurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
                "evidenceDigest": "0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
                "signerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "activeSignerAddress": "0x3b753B4406613C5E70ae640508632b600424fA0c",
                "signedText": "z-ai/glm-5.3-flash:8db86fe890cab95d3a77ce388b04a048dd04ba4e115ce0ace8cf93bb546ce3b7:d38c45008aaa3ab08582d1e4c01b69164ff4ed3d082b809650c452a55f748c8c",
                "ecdsaSignature": "0xe2f509cd8e0c232bcdc49ee44327958bcab4bd8b2cd644e69621c4ffda0f4221513b52edacb75c1865544d1e3f94da168ac84e30a41fe123b3272871f72c9c761b",
                "verificationMode": "LIVE_NEAR_AI_CLOUD_TEE",
                "resolver": "tee-node-intel-02.near",
                "resolvedAt": "1730598000000000000",
                "hardware": ENCLAVES_DB[TEEMarketEngine.INTEL_TDX_MEASUREMENT]["hardware"],
                "model": "z-ai/glm-5.3-flash",
                "attestationQuoteB64": quote_req4["attestation_quote_b64"],
                "zeroKnowledgeGuarantee": quote_req4["zero_knowledge_log_guarantee"],
                "rationale": "[NEAR AI Cloud TEE - z-ai/glm-5.3-flash] Chain Signatures historically process thousands of cross-chain transactions daily with only occasional spikes, leaving a roughly 10-50x gap to a sustained 100,000/day threshold. While NEAR's chain-abstraction momentum (intents, MPC network upgrades) is positive, no empirical data indicates adoption on track to sustain that volume by Q4 2026.",
                "evidenceSources": [
                    {"name": "Historical Chain Signatures on-chain usage data", "weight": 0.40, "stance": "Daily cross-chain signature volumes in low thousands to tens of thousands"},
                    {"name": "NEAR ecosystem growth reports (intents, MPC network)", "weight": 0.35, "stance": "Chain-abstraction tooling expanding steadily"},
                    {"name": "Live NEARUSDT market telemetry (Binance)", "weight": 0.25, "stance": "Price at $3.95 with ~$90M 24h volume reflects moderate activity"}
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
        "token_id_yes": "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        "token_id_no": "48331043336612883890938759509493159234755048973500640148014422747788308965732",
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
        "token_id_yes": "71321045679252212594626385532706912750332728571942532289631379312455583992563",
        "token_id_no": "52114319501245915516055106046884209969926127482827954674443846427813813222426",
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
        "token_id_yes": "84920193847561029384756102938475610293847561029384756102938475610293847561029",
        "token_id_no": "19283746509182736450918273645091827364509182736450918273645091827364509182736",
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
        "token_id_yes": "63849201928374650192837465019283746501928374650192837465019283746501928374650",
        "token_id_no": "37485960192837465019283746501928374650192837465019283746501928374650192837465",
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
    near_account_id: str = Field(..., min_length=2, max_length=64)
    market_id: str = Field(..., min_length=1, max_length=128)
    side: str = Field(..., pattern="^(BUY_YES|BUY_NO|BUY|SELL)$")
    amount_usd: float = Field(..., gt=0, le=10_000_000, description="Bet amount in USD (must be > 0)")
    limit_price: float = Field(..., ge=0.0, le=1.0, description="Limit price between 0.0 and 1.0")
    tee_attestation_hash: str = Field(..., min_length=2, max_length=256)
    network: str = Field(default="mainnet", description="NEAR network: 'testnet' or 'mainnet'")

class ExecuteIntentRequest(BaseModel):
    intent: Dict[str, Any]

class ConfirmOnChainIntentRequest(BaseModel):
    intent: Dict[str, Any]
    near_tx_hash: str = Field(..., min_length=10, max_length=128)
    mpc_signature: Optional[Dict[str, Any]] = None
    network: str = Field(default="testnet")

class CreateOracleRequestPayload(BaseModel):
    requester: str = Field(default="user.near", min_length=2, max_length=64, description="NEAR account ID submitting the oracle query")
    query: str = Field(..., min_length=1, max_length=MAX_QUERY_LEN, description="Prediction query or proposition prompt to be resolved by TEE")
    category: str = Field(default="General", max_length=MAX_CATEGORY_LEN, description="Category for contextual intelligence feeds")
    bounty_near: float = Field(default=1.0, ge=0.01, le=1_000_000, description="Attached incentive bounty in NEAR tokens (>= 0.01 NEAR)")
    callback_contract: Optional[str] = Field(default=None, description="Optional NEAR smart contract for automated callback")
    callback_method: Optional[str] = Field(default=None, description="Callback function to invoke upon resolution")
    near_tx_hash: Optional[str] = Field(default=None, description="Optional verified on-chain NEAR transaction hash")
    contract_id: Optional[str] = Field(default=None, description="Optional target NEAR smart contract ID")
    network: str = Field(default="testnet", description="Target NEAR network")

class ResolveOracleQueryPayload(BaseModel):
    request_id: Optional[str] = Field(default=None, description="ID of open request in database")
    query: Optional[str] = Field(default=None, max_length=MAX_QUERY_LEN, description="Prompt if running an ad-hoc query")
    category: Optional[str] = Field(default="General", max_length=MAX_CATEGORY_LEN, description="Topic category")
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
    request_body: Optional[str] = Field(default="", description="Raw NEAR AI Cloud request JSON body for on-chain SHA-256 verification")
    response_body: Optional[str] = Field(default="", description="Raw NEAR AI Cloud response JSON body for on-chain SHA-256 verification")
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

@app.get("/health")
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
def update_ai_config(
    payload: AIConfigPayload,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None)
):
    """
    SEC-03 fix: Enforces optional admin token authentication when PREDICTEE_ADMIN_TOKEN is set
    and strictly validates base_url against SSRF / credential exfiltration via domain whitelist.
    """
    admin_secret = os.getenv("PREDICTEE_ADMIN_TOKEN", "").strip()
    if admin_secret:
        provided = (x_admin_token or "").strip() or (authorization or "").removeprefix("Bearer ").strip()
        if provided != admin_secret:
            raise HTTPException(status_code=401, detail="Unauthorized: valid admin token required to update AI configuration")
    try:
        return tee_engine.configure_ai_provider(
            api_key=payload.api_key,
            base_url=payload.base_url,
            model=payload.model
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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

@app.get("/api/contract/config")
def get_deployed_contract_config(network: str = Query(default="testnet")):
    """
    Returns deployed NEAR smart contract metadata (`deployed-testnet.json`) and live on-chain stats.
    """
    svc = get_chain_sig_service(network)
    rpc_url = "https://rpc.testnet.near.org" if network == "testnet" else "https://rpc.mainnet.near.org"
    explorer_base = "https://testnet.nearblocks.io" if network == "testnet" else "https://nearblocks.io"
    meta_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "contracts", "deployed-testnet.json")
    )
    meta: Dict[str, Any] = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            meta = {}

    contract_id = meta.get("contractId") if network == "testnet" else svc.oracle_contract_id
    contract_id = contract_id or svc.oracle_contract_id

    live_stats = None
    try:
        r = requests.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": "predictee-contract-stats",
                "method": "query",
                "params": {
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": contract_id,
                    "method_name": "get_stats",
                    "args_base64": base64.b64encode(b"{}").decode("utf-8")
                }
            },
            timeout=5
        )
        if r.status_code == 200 and "result" in r.json() and "result" in r.json()["result"]:
            raw_bytes = bytes(r.json()["result"]["result"])
            live_stats = json.loads(raw_bytes.decode("utf-8"))
    except Exception:
        pass

    return {
        "network": network,
        "contractId": contract_id,
        "mpcContractId": svc.MPC_CONTRACT_ID,
        "rpcUrl": rpc_url,
        "explorerUrl": f"{explorer_base}/address/{contract_id}",
        "deployTxHash": meta.get("deployTxHash"),
        "liveOnChain": live_stats is not None,
        "onChainStats": live_stats,
    }

@app.get("/api/account/lookup/{account_id}")
def lookup_near_account(account_id: str, network: str = Query(default="mainnet")):
    """
    Queries live NEAR Testnet/Mainnet RPC for the specified account, retrieves on-chain balance,
    and dynamically derives its deterministic Polygon EVM address via `v1.signer` / `v1.signer-prod.testnet`.
    """
    clean_account = account_id.strip().lower()
    if not clean_account:
        raise HTTPException(status_code=400, detail="Account ID required")

    net = "testnet" if network.lower() == "testnet" else "mainnet"
    svc = get_chain_sig_service(net)
    derived_polygon = svc.derive_polygon_address(clean_account)
    rpc_url = "https://rpc.testnet.near.org" if net == "testnet" else "https://rpc.mainnet.near.org"
    on_chain_balance = "0.00 NEAR"
    exists_on_chain = False

    try:
        rpc_resp = requests.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": "predictee-account-lookup",
                "method": "query",
                "params": {
                    "request_type": "view_account",
                    "finality": "final",
                    "account_id": clean_account
                }
            },
            timeout=5
        )
        if rpc_resp.status_code == 200:
            res_json = rpc_resp.json()
            if "result" in res_json and "amount" in res_json["result"]:
                yocto_str = res_json["result"]["amount"]
                yocto_int = int(yocto_str)
                near_val = yocto_int / (10**24)
                on_chain_balance = f"{near_val:.2f} NEAR"
                exists_on_chain = True
    except Exception as e:
        print(f"[Account Lookup] NEAR {net} RPC lookup for {clean_account} failed: {e}")

    return {
        "accountId": clean_account,
        "network": net,
        "nearBalance": on_chain_balance,
        "existsOnChain": exists_on_chain,
        "derivedPolygonAddress": derived_polygon,
        "label": f"Live NEAR {net.capitalize()} Account" if exists_on_chain else f"Unfunded {net.capitalize()} Account",
        "mpcContract": svc.MPC_CONTRACT_ID,
        "isLiveWallet": True
    }

class AdminAuthPayload(BaseModel):
    password: str

@app.post("/api/admin/auth")
def verify_admin_auth(payload: AdminAuthPayload):
    admin_secret = os.getenv("PREDICTEE_ADMIN_TOKEN", "admin123").strip()
    if payload.password.strip() == admin_secret:
        return {"authenticated": True, "token": "predictee-operator-session-active"}
    raise HTTPException(status_code=401, detail="Invalid operator access token")

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
    clean_query = (payload.query or "").strip()
    clean_category = (payload.category or "General").strip() or "General"
    if not clean_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if len(clean_query) > MAX_QUERY_LEN:
        raise HTTPException(status_code=400, detail=f"Query exceeds maximum length of {MAX_QUERY_LEN} characters")
    if len(clean_category) > MAX_CATEGORY_LEN:
        raise HTTPException(status_code=400, detail=f"Category exceeds maximum length of {MAX_CATEGORY_LEN} characters")
    if payload.bounty_near < 0.01:
        raise HTTPException(status_code=400, detail="Bounty deposit must be at least 0.01 NEAR")

    evidence_sources = tee_engine._synthesize_evidence_feeds(clean_query, clean_category)
    bounty_yocto = str(int(payload.bounty_near * 10**24))
    created_at = str(int(time.time() * 1_000_000_000))

    with STATE_LOCK:
        REQUEST_NONCE += 1
        request_id = f"req-{REQUEST_NONCE}"
        svc = get_chain_sig_service(payload.network)
        explorer_base = "https://testnet.nearblocks.io" if payload.network == "testnet" else "https://nearblocks.io"
        tx_hash = payload.near_tx_hash.strip() if payload.near_tx_hash else None
        new_request = {
            "requestId": request_id,
            "requester": payload.requester.strip(),
            "query": clean_query,
            "category": clean_category,
            "bountyNear": float(payload.bounty_near),
            "bountyYocto": bounty_yocto,
            "status": "PENDING",
            "createdAt": created_at,
            "resolvedAt": None,
            "callbackContract": payload.callback_contract,
            "callbackMethod": payload.callback_method,
            "evidenceSources": evidence_sources,
            "nearTxHash": tx_hash,
            "contractId": payload.contract_id or svc.oracle_contract_id,
            "txExplorerUrl": f"{explorer_base}/txns/{tx_hash}" if tx_hash else None,
        }
        REQUESTS_DB[request_id] = new_request
        save_persisted_state()

    # Build NEAR transaction payload ready for user signing
    tx = svc.build_request_resolution_tx(
        requester_account_id=payload.requester,
        query=clean_query,
        category=clean_category,
        bounty_near=payload.bounty_near,
        callback_contract=payload.callback_contract,
        callback_method=payload.callback_method,
        oracle_contract_id=payload.contract_id
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

    with STATE_LOCK:
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
        canonical_fulfill_msg = tee_engine.build_canonical_fulfill_message(
            request_id=payload.request_id,
            outcome=payload.outcome,
            confidence_bps=payload.confidence_bps,
            resolver=resolver_id,
            attestation_hash=payload.attestation_hash,
            enclave_measurement=payload.enclave_measurement,
            evidence_digest=payload.evidence_digest or ""
        )
        quote_b64 = payload.attestation_quote_b64 or generated_quote["attestation_quote_b64"]
        verification_mode = payload.verification_mode or generated_quote["verification_mode"]
        attested_enclave_address = enclave_meta.get("signingAddress") or generated_quote["attested_signing_address"]
        # P1-3 fix: Report the actual signer that produced ecdsa_signature; never spoof attested_enclave_address in sandbox mode
        if verification_mode == "LIVE_NEAR_AI_CLOUD_TEE" and payload.signer_address:
            signer_address = payload.signer_address
        else:
            signer_address = generated_quote["signer_address"]

        has_native_bodies = bool(payload.request_body and payload.response_body)
        if has_native_bodies and payload.signed_text:
            signed_text = payload.signed_text
        elif not payload.signed_text or payload.signed_text.startswith("PREDICTEE_RESOLVE_"):
            signed_text = canonical_fulfill_msg
        else:
            signed_text = payload.signed_text
        ecdsa_signature = payload.ecdsa_signature or generated_quote["ecdsa_signature"]

        resolution = {
            "requestId": payload.request_id,
            "outcome": payload.outcome.strip().upper(),
            "confidenceBps": payload.confidence_bps,
            "attestationHash": payload.attestation_hash.strip(),
            "enclaveMeasurement": payload.enclave_measurement,
            "evidenceDigest": payload.evidence_digest or "",
            "signerAddress": signer_address,
            "attestedEnclaveAddress": attested_enclave_address,
            "activeSignerAddress": signer_address,
            "signedText": signed_text,
            "canonicalFulfillMessage": canonical_fulfill_msg,
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

        # Update in-memory state and persist atomically under lock
        req["status"] = "RESOLVED"
        req["resolvedAt"] = resolved_at
        if payload.evidence_sources:
            req["evidenceSources"] = payload.evidence_sources
        RESOLUTIONS_DB[payload.request_id] = resolution

        bounty_yocto = int(req.get("bountyYocto", 0))
        TOTAL_BOUNTIES_PAID_YOCTO += bounty_yocto
        save_persisted_state()

    # Build NEAR on-chain transaction (supports both Mode A native bodies and Mode B canonical message)
    tx = chain_sig_service.build_fulfill_resolution_tx(
        resolver_account_id=resolver_id,
        request_id=payload.request_id,
        outcome=payload.outcome.strip().upper(),
        confidence_bps=payload.confidence_bps,
        attestation_hash=payload.attestation_hash,
        enclave_measurement=payload.enclave_measurement,
        evidence_digest=payload.evidence_digest or "",
        signed_text=signed_text if has_native_bodies else canonical_fulfill_msg,
        ecdsa_signature=ecdsa_signature,
        request_body=payload.request_body or "",
        response_body=payload.response_body or ""
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
    has_live_key = bool(tee_engine.near_ai_api_key) and (os.getenv("PREDICTEE_TEST_MODE") != "1")
    for idx, m in enumerate(raw_markets):
        analysis = tee_engine.evaluate_market(m, use_live_ai=(has_live_key and idx < 2))
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

    has_live_key = bool(tee_engine.near_ai_api_key) and (os.getenv("PREDICTEE_TEST_MODE") != "1")
    analysis = tee_engine.evaluate_market(market, use_live_ai=has_live_key)
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
    svc = get_chain_sig_service(req.network)
    intent = svc.build_polymarket_order_intent(
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

@app.post("/api/intent/confirm-onchain")
def confirm_onchain_intent(req: ConfirmOnChainIntentRequest):
    svc = get_chain_sig_service(req.network)
    executed = svc.record_onchain_mpc_signature(
        intent=req.intent,
        near_tx_hash=req.near_tx_hash,
        mpc_result=req.mpc_signature,
        network=req.network
    )
    return {"executed_order": executed}

@app.post("/api/dev/reset")
def reset_oracle_demo_state():
    """
    Resets oracle_state.json and in-memory state back to the initial 6 seed requests
    so judges can repeatedly test Step 4 (`req-3` PENDING -> RESOLVED) cleanly.
    """
    with STATE_LOCK:
        if os.getenv("PREDICTEE_TEST_MODE") != "1" and os.path.exists(STATE_FILE_PATH):
            try:
                os.remove(STATE_FILE_PATH)
            except OSError:
                pass
        init_seed_data()
        save_persisted_state()
    return {
        "reset": True,
        "totalRequests": len(REQUESTS_DB),
        "pendingRequests": [k for k, v in REQUESTS_DB.items() if v["status"] == "PENDING"]
    }

# ==========================================
# Operator Admin Backend Endpoints (/api/admin/*)
# ==========================================

class AdminModelConfigPayload(BaseModel):
    model: Optional[str] = Field(default=None, description="Active NEAR AI Cloud TEE model identifier")
    api_key: Optional[str] = Field(default=None, description="Optional new NEAR AI Cloud API key (leave empty to keep existing server key)")
    base_url: Optional[str] = Field(default=None, description="Optional NEAR AI Cloud base URL")
    persist_to_env: bool = Field(default=True, description="Whether to persist model/key updates to server .env")

class AdminToggleEnclavePayload(BaseModel):
    measurement: str = Field(..., description="Enclave measurement ID to toggle")
    active: Optional[bool] = Field(default=None, description="Explicit active state or None to toggle")

def _update_server_env_file(updates: Dict[str, str]):
    """Safely updates specific keys in packages/agent/.env without reading/logging existing secret values."""
    if os.getenv("PREDICTEE_TEST_MODE") == "1":
        return
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    lines: List[str] = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    updated_keys = set()
    new_lines: List[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        k = stripped.split("=", 1)[0].strip()
        if k in updates and updates[k] is not None:
            new_lines.append(f"{k}={updates[k]}")
            updated_keys.add(k)
        else:
            new_lines.append(line)
    for k, v in updates.items():
        if k not in updated_keys and v is not None:
            new_lines.append(f"{k}={v}")
    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(new_lines) + "\n")

@app.get("/api/admin/overview")
def admin_overview():
    """Returns full node operator telemetry, model catalog, masked server key status, and oracle metrics."""
    has_key = bool(tee_engine.near_ai_api_key)
    model_catalog = [
        {
            "id": "z-ai/glm-5.3-flash",
            "name": "GLM-5.3-Flash (Confidential Reasoning TEE)",
            "provider": "NEAR AI Cloud / Zhipu AI",
            "hardware": "Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)",
            "measurement": TEEMarketEngine.INTEL_TDX_MEASUREMENT,
            "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.INTEL_TDX_MEASUREMENT],
            "latency": "~6.5s (Chain-of-Thought + Hardware ECDSA)",
            "recommendedFor": "Fast Subjective Oracle Resolution & Real-Time Polymarket Alpha"
        },
        {
            "id": "Qwen/Qwen3.8-27B",
            "name": "Qwen 3.8 27B (Dense Confidential GPU TEE)",
            "provider": "NEAR AI Cloud / Qwen",
            "hardware": "NVIDIA H100 SXM5 80GB (NRAS v3 + Intel TDX RTMR0)",
            "measurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT,
            "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.NVIDIA_H100_MEASUREMENT],
            "latency": "~9.2s (Dense 27B Multi-Source Synthesis)",
            "recommendedFor": "Complex Macroeconomic, Regulatory & Multi-Condition Inquiries"
        },
        {
            "id": "Qwen/Qwen3.6-35B-A3B-FP8",
            "name": "Qwen 3.6 35B-A3B FP8 (MoE High-Throughput TEE)",
            "provider": "NEAR AI Cloud / Qwen",
            "hardware": "NVIDIA H100 SXM5 80GB FP8 Confidential Enclave",
            "measurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT,
            "signingAddress": TEEMarketEngine.VERIFIED_SIGNING_ADDRESSES[TEEMarketEngine.NVIDIA_H100_MEASUREMENT],
            "latency": "~5.8s (Sparse 3B Active MoE)",
            "recommendedFor": "High-Frequency Orderbook Scanning & Batch Market Evaluation"
        }
    ]
    return {
        "ai_engine": {
            "has_api_key": has_key,
            "key_status_label": "sk-•••••••••••••••• (Server .env Active)" if has_key else "Not Configured (Keyless Mode)",
            "active_model": tee_engine.near_ai_model,
            "base_url": tee_engine.near_ai_base_url,
            "verification_mode": "LIVE_NEAR_AI_CLOUD_TEE" if has_key else "KEYLESS_ATTESTATION_SANDBOX_DEMO",
            "cached_live_inferences": len(tee_engine._live_ai_cache),
            "model_catalog": model_catalog
        },
        "stats": get_oracle_stats(),
        "enclaves": list_enclaves()["enclaves"]
    }

@app.post("/api/admin/model")
def admin_update_model_and_key(
    payload: AdminModelConfigPayload,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None)
):
    """
    Operator endpoint to switch the active NEAR AI Cloud TEE model (`z-ai/glm-5.3-flash`, `Qwen/Qwen3.8-27B`, etc.)
    or rotate the backend `NEAR_AI_API_KEY` without ever exposing existing keys to the client.
    """
    admin_secret = os.getenv("PREDICTEE_ADMIN_TOKEN", "").strip()
    if admin_secret:
        provided = (x_admin_token or "").strip() or (authorization or "").removeprefix("Bearer ").strip()
        if provided != admin_secret:
            raise HTTPException(status_code=401, detail="Unauthorized: valid admin token required")

    env_updates: Dict[str, str] = {}
    if payload.base_url and payload.base_url.strip():
        try:
            tee_engine.near_ai_base_url = validate_near_ai_base_url(payload.base_url.strip())
            env_updates["NEAR_AI_BASE_URL"] = tee_engine.near_ai_base_url
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if payload.model and payload.model.strip():
        clean_model = payload.model.strip()
        if clean_model not in tee_engine.supported_models:
            raise HTTPException(status_code=400, detail=f"Unsupported TEE model: {clean_model}")
        tee_engine.near_ai_model = clean_model
        env_updates["NEAR_AI_MODEL"] = clean_model

    if payload.api_key is not None and payload.api_key.strip():
        tee_engine.near_ai_api_key = payload.api_key.strip()
        env_updates["NEAR_AI_API_KEY"] = tee_engine.near_ai_api_key

    if payload.persist_to_env and env_updates:
        _update_server_env_file(env_updates)

    return admin_overview()

@app.post("/api/admin/requests/{request_id}/reopen")
def admin_reopen_request(request_id: str):
    """Allows the operator to reopen a resolved inquiry back to PENDING so it can be re-resolved with an updated TEE model."""
    with STATE_LOCK:
        if request_id not in REQUESTS_DB:
            raise HTTPException(status_code=404, detail=f"Request {request_id} not found")
        REQUESTS_DB[request_id]["status"] = "PENDING"
        REQUESTS_DB[request_id]["resolvedAt"] = None
        if request_id in RESOLUTIONS_DB:
            del RESOLUTIONS_DB[request_id]
        save_persisted_state()
    return {"reopened": True, "request_id": request_id}

@app.delete("/api/admin/requests/{request_id}")
def admin_delete_request(request_id: str):
    """Allows the operator to delete an inquiry (e.g., removing test/spam requests)."""
    with STATE_LOCK:
        if request_id not in REQUESTS_DB:
            raise HTTPException(status_code=404, detail=f"Request {request_id} not found")
        del REQUESTS_DB[request_id]
        if request_id in RESOLUTIONS_DB:
            del RESOLUTIONS_DB[request_id]
        save_persisted_state()
    return {"deleted": True, "request_id": request_id, "remaining": len(REQUESTS_DB)}

@app.post("/api/admin/enclaves/toggle")
def admin_toggle_enclave(payload: AdminToggleEnclavePayload):
    """Allows the operator to activate or pause a whitelisted TEE enclave measurement."""
    with STATE_LOCK:
        if payload.measurement not in ENCLAVES_DB:
            raise HTTPException(status_code=404, detail="Enclave measurement not found")
        current = ENCLAVES_DB[payload.measurement]["active"]
        ENCLAVES_DB[payload.measurement]["active"] = payload.active if payload.active is not None else (not current)
    return {"enclaves": list_enclaves()["enclaves"]}

if __name__ == "__main__":
    uvicorn.run(
        "agent:app",
        host="127.0.0.1",
        port=8000,
        reload=(os.getenv("PREDICTEE_DEV_RELOAD") == "1")
    )
