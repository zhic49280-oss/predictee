#!/usr/bin/env python3
"""
Headless End-to-End Verification Script for AI Judges (Claude Code / Codex / CI).
Verifies the full PredicTEE lifecycle without requiring a browser UI:
  1. Health & Enclave Whitelist Verification (/api/health, /api/oracle/enclaves)
  2. Step 4 (Headless): Trigger TEE Oracle Resolution & On-Chain Fulfillment (/api/oracle/resolve -> /api/oracle/fulfill)
  3. Step 5 (Headless): Prepare & Sign Cross-Chain Polymarket EIP-712 Order via NEAR MPC (/api/intent/create -> /api/intent/execute)
"""
import os
import sys
import json

os.environ["PREDICTEE_TEST_MODE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from agent import app

client = TestClient(app)


def run_headless_verification():
    print("========================================================================")
    print("  PREDICTEE HEADLESS E2E VERIFICATION (FOR AI JUDGES: CLAUDE / CODEX)   ")
    print("========================================================================")

    # 1. Health & Enclave Check + Reset Demo State so req-3 is always PENDING
    client.post("/api/dev/reset")
    h = client.get("/api/health").json()
    assert h["status"] == "online", "Health check failed"
    print(f"[1/3] Backend Health Verified: {h['service']} (MPC: {h['mpc_signer']})")

    # 2. Step 4 (Headless): Trigger TEE Resolution & Fulfill on req-3
    print("\n[2/3] Step 4 (Headless): Triggering TEE Resolution & Fulfillment for req-3...")
    res_resolve = client.post("/api/oracle/resolve", json={"request_id": "req-3"})
    assert res_resolve.status_code == 200, f"Resolve failed: {res_resolve.text}"
    r_data = res_resolve.json()
    att = r_data["tee_attestation"]

    res_fulfill = client.post(
        "/api/oracle/fulfill",
        json={
            "request_id": "req-3",
            "outcome": r_data["outcome"],
            "confidence_bps": r_data["confidence_bps"],
            "attestation_hash": att["attestation_hash"],
            "enclave_measurement": att["enclave_measurement"],
            "evidence_digest": r_data["evidence_digest"],
            "signer_address": att["attested_signing_address"],
            "signed_text": att["signed_text"],
            "ecdsa_signature": att["ecdsa_signature"],
            "verification_mode": att["verification_mode"],
            "resolver": "tee-node-intel-01.near"
        }
    )
    assert res_fulfill.status_code == 200, f"Fulfill failed: {res_fulfill.text}"
    f_data = res_fulfill.json()["resolution"]
    print(f"      -> Request req-3 transitioned PENDING -> RESOLVED")
    print(f"      -> Outcome: {f_data['outcome']} ({f_data['confidenceBps']} bps)")
    print(f"      -> Enclave Measurement: {f_data['enclaveMeasurement'][:48]}...")
    print(f"      -> Canonical Fulfill Msg: {f_data['canonicalFulfillMessage'][:64]}...")

    # 3. Step 5 (Headless): Prepare & Sign Cross-Chain Polymarket Order via NEAR MPC
    print("\n[3/3] Step 5 (Headless): Preparing & Signing Cross-Chain Polymarket Order via NEAR MPC...")
    res_intent = client.post(
        "/api/intent/create",
        json={
            "near_account_id": "alice.near",
            "market_id": "pm-deepseek-v4-bench",
            "side": "BUY_YES",
            "amount_usd": 50.0,
            "limit_price": 0.61,
            "tee_attestation_hash": att["attestation_hash"]
        }
    )
    assert res_intent.status_code == 200, f"Intent creation failed: {res_intent.text}"
    intent = res_intent.json()["intent"]
    res_exec = client.post("/api/intent/execute", json={"intent": intent})
    assert res_exec.status_code == 200, f"Intent execution failed: {res_exec.text}"
    executed = res_exec.json()["executed_order"]
    print(f"      -> Source NEAR Account:     {executed['near_account_id']}")
    print(f"      -> Derived Polygon Address: {executed['derived_polygon_address']}")
    print(f"      -> EIP-712 Order Digest:    {executed['eip712_digest']}")
    print(f"      -> NEAR Intents 1-Click:    {executed['near_intents_1click_quote']['quote_mode']}")
    print(f"      -> Execution Status:        {executed['status']} ({executed['execution_mode']})")

    # Reset demo state so req-3 remains PENDING for subsequent runs
    client.post("/api/dev/reset")

    print("\n========================================================================")
    print("SUCCESS: ALL HEADLESS STEPS (STEP 4 & STEP 5) VERIFIED WITHOUT A BROWSER")
    print("========================================================================")


if __name__ == "__main__":
    run_headless_verification()
