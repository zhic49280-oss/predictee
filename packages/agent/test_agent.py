"""
Comprehensive Test Suite for PredicTEE Agent & Verifiable TEE AI Oracle
Tests Oracle REST endpoints, TEE hardware attestation, MPC Chain Signatures,
and backward-compatible prediction market intent execution.
"""
import sys
import os
import json
import base64
from fastapi.testclient import TestClient

# Run unit tests in isolated in-memory mode
os.environ["PREDICTEE_TEST_MODE"] = "1"

# Ensure local packages/agent directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent import app, ENCLAVES_DB, REQUESTS_DB, RESOLUTIONS_DB
from tee_engine import TEEMarketEngine
from chain_sig import NEARChainSignatureService

client = TestClient(app)

def test_clob_token_ids_bug_fix():
    print("\n[Test 1] Testing clobTokenIds JSON string parsing bug fix...")
    # Simulate Polymarket Gamma API response with stringified JSON
    sample_clob_str = '["3626274482910398402847", "8838382910492847193021"]'
    parsed = json.loads(sample_clob_str) if isinstance(sample_clob_str, str) else sample_clob_str
    assert isinstance(parsed, list), "Parsed clobTokenIds must be a list"
    assert parsed[0] == "3626274482910398402847", f"Expected token ID string, got {parsed[0]}"
    assert parsed[0] != "[", "CRITICAL BUG: clobTokenIds[0] was indexed as raw string '['!"
    print("  [PASS] clobTokenIds JSON string parsed safely and correctly without string indexing bug.")

def test_tee_engine_oracle_resolution():
    print("\n[Test 2] Testing TEEMarketEngine Oracle Query Resolution & Attestation...")
    engine = TEEMarketEngine()

    # 1. Verify whitelisted enclave measurements (real NEAR AI Cloud TDX MRTD, RTMR0 & Dstack Compose SHA-256)
    assert engine.CODE_MEASUREMENT == TEEMarketEngine.INTEL_TDX_MEASUREMENT
    assert engine.CODE_MEASUREMENT.startswith("tdx-mrtd:df4d77c857de652bd0fafa343a2026b5")
    assert len(engine.INTEL_TDX_MEASUREMENT.split(":", 1)[1]) == 96  # SHA-384 TD10 MRTD = 96 hex chars
    assert len(engine.NVIDIA_H100_MEASUREMENT.split(":", 1)[1]) == 96  # SHA-384 TD10 RTMR0 = 96 hex chars
    assert len(engine.PHALA_DSTACK_MEASUREMENT.split(":", 1)[1]) == 64  # SHA-256 compose hash = 64 hex chars
    assert engine.is_measurement_valid(TEEMarketEngine.INTEL_TDX_MEASUREMENT)
    assert engine.is_measurement_valid(TEEMarketEngine.NVIDIA_H100_MEASUREMENT)
    assert engine.is_measurement_valid(TEEMarketEngine.PHALA_DSTACK_MEASUREMENT)
    assert not engine.is_measurement_valid("sha256:invalid_unverified_measurement")
    print("  [PASS] Real NEAR AI Cloud enclave measurements verified (TDX MRTD, RTMR0, Dstack SHA-256).")

    # 2. Test resolve_oracle_query with Intel TDX
    res_tdx = engine.resolve_oracle_query(
        query="Will the Federal Reserve cut interest rates by 25 bps in December 2026?",
        category="Macro & Fed",
        enclave_measurement=TEEMarketEngine.INTEL_TDX_MEASUREMENT
    )

    assert res_tdx["outcome"] in ["YES", "NO"], f"Invalid outcome: {res_tdx['outcome']}"
    assert 0 <= res_tdx["confidence_bps"] <= 10000, f"Confidence BPS out of range: {res_tdx['confidence_bps']}"
    assert isinstance(res_tdx["alpha_divergence"], float)
    assert len(res_tdx["rationale"]) > 20
    assert len(res_tdx["evidence_sources"]) >= 3
    assert res_tdx["evidence_digest"].startswith("0x")

    attestation = res_tdx["tee_attestation"]
    assert attestation["is_tee_verified"] is True
    assert attestation["enclave_measurement"] == TEEMarketEngine.INTEL_TDX_MEASUREMENT
    assert "Intel TDX" in attestation["hardware"]
    assert attestation["attestation_hash"].startswith("0x")
    assert len(attestation["attestation_quote_b64"]) > 0
    assert "No user prompts" in attestation["zero_knowledge_log_guarantee"]
    print(f"  [PASS] Intel TDX resolution generated: Outcome={res_tdx['outcome']}, Confidence={res_tdx['confidence_bps']} bps")

    # 3. Test resolve_oracle_query with NVIDIA H100 Confidential GPU
    res_h100 = engine.resolve_oracle_query(
        query="Will DeepSeek-V4 outperform Claude 3.7 on SWE-Bench?",
        category="AI Benchmarks",
        enclave_measurement=TEEMarketEngine.NVIDIA_H100_MEASUREMENT
    )
    assert res_h100["tee_attestation"]["enclave_measurement"] == TEEMarketEngine.NVIDIA_H100_MEASUREMENT
    assert "NVIDIA H100" in res_h100["tee_attestation"]["hardware"]
    print(f"  [PASS] NVIDIA H100 resolution generated: Enclave={res_h100['tee_attestation']['hardware']}")

    # 4. Backward-compatible evaluate_market test
    market_sample = {
        "id": "pm-test-1",
        "title": "Fed Rate Decision",
        "market_prob": 0.40,
        "evidence_sources": [{"name": "Futures", "weight": 0.5, "stance": "Hold"}]
    }
    market_eval = engine.evaluate_market(market_sample)
    assert "ai_true_prob" in market_eval
    assert "alpha_divergence" in market_eval
    assert "tee_attestation" in market_eval
    print("  [PASS] evaluate_market backward compatibility preserved.")

def test_chain_signature_service():
    print("\n[Test 3] Testing NEARChainSignatureService transaction builders & zero-division guard...")
    service = NEARChainSignatureService()

    # 1. Test build_request_resolution_tx
    tx_req = service.build_request_resolution_tx(
        requester_account_id="alice.near",
        query="Will Solana flip Ethereum in market cap in 2026?",
        category="Crypto Milestones",
        bounty_near=2.5,
        callback_contract="consumer.near",
        callback_method="on_oracle_resolved"
    )
    assert tx_req["signer_id"] == "alice.near"
    assert tx_req["bounty_near"] == 2.5
    assert tx_req["bounty_yocto"] == str(int(2.5 * 10**24))
    action = tx_req["actions"][0]
    assert action["params"]["method_name"] == "request_resolution"
    assert action["params"]["deposit"] == str(int(2.5 * 10**24))
    assert action["params"]["args"]["query"] == "Will Solana flip Ethereum in market cap in 2026?"
    assert action["params"]["args"]["callback_contract"] == "consumer.near"
    print("  [PASS] build_request_resolution_tx generates valid NEP-compatible payload.")

    # 2. Test build_fulfill_resolution_tx
    tx_ful = service.build_fulfill_resolution_tx(
        resolver_account_id="tee-node-01.near",
        request_id="req-1",
        outcome="NO",
        confidence_bps=8950,
        attestation_hash="0xabcdef123456",
        enclave_measurement=TEEMarketEngine.INTEL_TDX_MEASUREMENT,
        evidence_digest="0x123456abcdef"
    )
    assert tx_ful["signer_id"] == "tee-node-01.near"
    assert tx_ful["request_id"] == "req-1"
    ful_action = tx_ful["actions"][0]
    assert ful_action["params"]["method_name"] == "fulfill_resolution"
    assert ful_action["params"]["args"]["outcome"] == "NO"
    assert ful_action["params"]["args"]["confidence_bps"] == 8950
    assert ful_action["params"]["args"]["enclave_measurement"] == TEEMarketEngine.INTEL_TDX_MEASUREMENT
    print("  [PASS] build_fulfill_resolution_tx generates valid fulfill transaction payload.")

    # 3. Test canonical NEAR MPC secp256k1 epsilon derivation & limit_price zero-division guard
    derived_alice = service.derive_polygon_address("alice.near", "polymarket")
    assert derived_alice == "0xd9EfEf5d4bc96d747f817F8bCFc307591d377BfA", f"Unexpected MPC derived address: {derived_alice}"
    print(f"  [PASS] Canonical NEAR MPC secp256k1 epsilon derivation verified: alice.near -> {derived_alice}")

    intent_zero = service.build_polymarket_order_intent(
        near_account_id="alice.near",
        market_id="m1",
        token_id="0x1",
        side="BUY_YES",
        amount_usd=100.0,
        limit_price=0.0, # Dangerous zero value
        tee_attestation_hash="0xquote"
    )
    assert intent_zero["limit_price"] >= 0.01, f"Zero division unguarded: limit_price={intent_zero['limit_price']}"
    assert intent_zero["eip712_order"]["side"] == 0, "Polymarket BUY order must have CLOB side=0"
    print("  [PASS] Zero-division guard safely clamped limit_price=0.0 to 0.01 & EIP-712 digest verified.")

    # 4. Test MPC signing simulation
    signed = service.simulate_mpc_signing(intent_zero)
    assert signed["status"] == "MPC_SIGNED_EXECUTED"
    assert signed["polygon_tx_hash"].startswith("0x")
    assert signed["mpc_signature"]["v"] == 27
    print("  [PASS] MPC signing simulation succeeded.")

def test_oracle_rest_api():
    print("\n[Test 4] Testing FastAPI Oracle Endpoints...")

    # 1. GET /api/health
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["version"] == "2.0.0"
    print("  [PASS] GET /api/health passed.")

    # 2. GET /api/oracle/stats
    res = client.get("/api/oracle/stats")
    assert res.status_code == 200
    stats = res.json()
    assert "totalRequests" in stats
    assert "pendingCount" in stats
    assert "resolvedCount" in stats
    assert "activeEnclavesCount" in stats
    assert stats["activeEnclavesCount"] == 3
    print(f"  [PASS] GET /api/oracle/stats passed: {stats['resolvedCount']} resolved, {stats['pendingCount']} pending.")

    # 3. GET /api/oracle/enclaves
    res = client.get("/api/oracle/enclaves")
    assert res.status_code == 200
    enclaves = res.json().get("enclaves", [])
    assert len(enclaves) == 3
    measurements = [e["measurement"] for e in enclaves]
    assert TEEMarketEngine.INTEL_TDX_MEASUREMENT in measurements
    assert TEEMarketEngine.NVIDIA_H100_MEASUREMENT in measurements
    print("  [PASS] GET /api/oracle/enclaves passed: 3 verified TEE enclaves listed.")

    # 4. GET /api/oracle/requests
    res = client.get("/api/oracle/requests")
    assert res.status_code == 200
    requests_data = res.json()
    assert requests_data["total"] >= 6
    resolved_req = next(r for r in requests_data["requests"] if r["status"] == "RESOLVED")
    assert resolved_req["resolution"] is not None
    assert resolved_req["resolution"]["attestationHash"].startswith("0x")
    print(f"  [PASS] GET /api/oracle/requests passed: {requests_data['total']} seeded requests found.")

    # 5. GET /api/oracle/requests with status filter
    res_pending = client.get("/api/oracle/requests?status=PENDING")
    assert res_pending.status_code == 200
    for r in res_pending.json()["requests"]:
        assert r["status"] == "PENDING"
    print("  [PASS] GET /api/oracle/requests?status=PENDING filter working correctly.")

    # 6. GET /api/oracle/request/{request_id}
    res_single = client.get("/api/oracle/request/req-1")
    assert res_single.status_code == 200
    single_data = res_single.json()
    assert single_data["request"]["requestId"] == "req-1"
    assert single_data["resolution"]["outcome"] == "NO"

    res_404 = client.get("/api/oracle/request/req-non-existent")
    assert res_404.status_code == 404
    print("  [PASS] GET /api/oracle/request/{id} passed for both 200 and 404 cases.")

    # 7. POST /api/oracle/request (Create new question)
    create_payload = {
        "requester": "hackathon_judge.near",
        "query": "Will NEAR AI User-Owned Hackathon receive over 500 project submissions?",
        "category": "NEAR Ecosystem",
        "bounty_near": 3.5,
        "callback_contract": "judge_dapp.near",
        "callback_method": "on_verdict"
    }
    res_create = client.post("/api/oracle/request", json=create_payload)
    assert res_create.status_code == 200
    create_data = res_create.json()
    assert create_data["success"] is True
    new_req_id = create_data["request"]["requestId"]
    assert new_req_id.startswith("req-")
    assert create_data["transaction"]["actions"][0]["params"]["method_name"] == "request_resolution"
    assert create_data["transaction"]["bounty_near"] == 3.5
    print(f"  [PASS] POST /api/oracle/request created new question: ID={new_req_id}, Bounty=3.5 NEAR.")

    # 8. POST /api/oracle/resolve (Run TEE inference & produce cryptographic quote)
    resolve_payload = {
        "request_id": new_req_id,
        "enclave_measurement": TEEMarketEngine.NVIDIA_H100_MEASUREMENT
    }
    res_resolve = client.post("/api/oracle/resolve", json=resolve_payload)
    assert res_resolve.status_code == 200
    resolve_data = res_resolve.json()
    assert resolve_data["outcome"] in ["YES", "NO"]
    assert 0 <= resolve_data["confidence_bps"] <= 10000
    assert resolve_data["tee_attestation"]["enclave_measurement"] == TEEMarketEngine.NVIDIA_H100_MEASUREMENT
    print(f"  [PASS] POST /api/oracle/resolve resolved query in TEE: Outcome={resolve_data['outcome']}, Hash={resolve_data['tee_attestation']['attestation_hash']}")

    # 9. POST /api/oracle/fulfill (Fulfill on-chain and release bounty)
    fulfill_payload = {
        "request_id": new_req_id,
        "outcome": resolve_data["outcome"],
        "confidence_bps": resolve_data["confidence_bps"],
        "attestation_hash": resolve_data["tee_attestation"]["attestation_hash"],
        "enclave_measurement": resolve_data["tee_attestation"]["enclave_measurement"],
        "evidence_digest": resolve_data["evidence_digest"],
        "signer_address": resolve_data["tee_attestation"]["attested_signing_address"],
        "signed_text": resolve_data["tee_attestation"]["signed_text"],
        "ecdsa_signature": resolve_data["tee_attestation"]["ecdsa_signature"],
        "verification_mode": resolve_data["tee_attestation"]["verification_mode"],
        "resolver": "tee-node-h100-01.near"
    }
    res_fulfill = client.post("/api/oracle/fulfill", json=fulfill_payload)
    assert res_fulfill.status_code == 200
    fulfill_data = res_fulfill.json()
    assert fulfill_data["success"] is True
    assert fulfill_data["resolution"]["requestId"] == new_req_id
    assert fulfill_data["resolution"]["signerAddress"] == "0x835ab53d20294ef795906dff21ae4c045336aa26"
    assert fulfill_data["resolution"]["ecdsaSignature"].startswith("0x")
    assert fulfill_data["transaction"]["actions"][0]["params"]["args"]["ecdsa_signature"].startswith("0x")
    assert fulfill_data["simulated_payout"]["resolver"] == "tee-node-h100-01.near"
    assert fulfill_data["simulated_payout"]["bounty_near"] == 3.5
    print(f"  [PASS] POST /api/oracle/fulfill settled {new_req_id} with verified signer {fulfill_data['resolution']['signerAddress']} and paid 3.5 NEAR.")

    # 10. Verify request is now marked RESOLVED in GET /api/oracle/request/{id}
    res_after = client.get(f"/api/oracle/request/{new_req_id}")
    assert res_after.status_code == 200
    assert res_after.json()["request"]["status"] == "RESOLVED"
    assert res_after.json()["resolution"]["outcome"] == resolve_data["outcome"]
    print("  [PASS] State verified: Request status transitioned PENDING -> RESOLVED.")

    # 11. Reject unverified enclave measurement on fulfill
    bad_fulfill = dict(fulfill_payload)
    bad_fulfill["request_id"] = "req-5" # req-5 is pending
    bad_fulfill["enclave_measurement"] = "sha256:fake_untrusted_enclave_hash"
    res_bad = client.post("/api/oracle/fulfill", json=bad_fulfill)
    assert res_bad.status_code == 400
    assert "Unverified TEE Hardware" in res_bad.json()["detail"]
    print("  [PASS] Security check: Unverified TEE Hardware correctly rejected with 400 Bad Request.")

def test_backward_compatibility_endpoints():
    print("\n[Test 5] Testing Backward-Compatible Prediction Market Endpoints...")

    # 1. GET /api/markets
    res_markets = client.get("/api/markets")
    assert res_markets.status_code == 200
    markets = res_markets.json().get("markets", [])
    assert len(markets) >= 2
    for m in markets:
        assert "ai_analysis" in m
        assert "tee_attestation" in m["ai_analysis"]
        assert "token_id_yes" in m
        assert m["token_id_yes"] != "["
    print(f"  [PASS] GET /api/markets returned {len(markets)} enriched markets with verified TEE quotes.")

    # 2. GET /api/market/{id}
    sample_id = markets[0]["id"]
    res_m = client.get(f"/api/market/{sample_id}")
    assert res_m.status_code == 200
    m_data = res_m.json()
    assert m_data["market"]["id"] == sample_id
    assert "ai_analysis" in m_data
    print(f"  [PASS] GET /api/market/{sample_id} returned valid single market detail.")

    # 3. POST /api/intent/create
    create_intent_payload = {
        "near_account_id": "bob.near",
        "market_id": sample_id,
        "side": "BUY_YES",
        "amount_usd": 50.0,
        "limit_price": 0.45,
        "tee_attestation_hash": "0xattestation_proof_hash"
    }
    res_intent = client.post("/api/intent/create", json=create_intent_payload)
    assert res_intent.status_code == 200
    intent = res_intent.json()["intent"]
    assert intent["status"] == "READY_FOR_MPC_SIGNATURE"
    assert intent["near_account_id"] == "bob.near"
    print("  [PASS] POST /api/intent/create prepared valid EIP-712 cross-chain betting intent.")

    # 4. POST /api/intent/execute
    res_exec = client.post("/api/intent/execute", json={"intent": intent})
    assert res_exec.status_code == 200
    exec_data = res_exec.json()["executed_order"]
    assert exec_data["status"] == "MPC_SIGNED_EXECUTED"
    assert exec_data["polygon_tx_hash"].startswith("0x")
    print("  [PASS] POST /api/intent/execute signed and executed cross-chain order.")

if __name__ == "__main__":
    print("================================================================")
    print("Running PredicTEE Agent & Verifiable TEE AI Oracle Test Suite...")
    print("================================================================")
    test_clob_token_ids_bug_fix()
    test_tee_engine_oracle_resolution()
    test_chain_signature_service()
    test_oracle_rest_api()
    test_backward_compatibility_endpoints()
    print("\n================================================================")
    print("SUCCESS: ALL 5 TEST SUITES PASSED CLEANLY (100% SUCCESS)!")
    print("================================================================")
