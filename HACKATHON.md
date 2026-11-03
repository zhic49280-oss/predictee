# 🔮 HACKATHON.md — PredicTEE: Verifiable TEE AI Oracle on NEAR

> **NEAR Hackathon 2026 Project Overview**  
> **Event Timeline:** November 1, 00:00 UTC – November 14, 23:59 UTC, 2026  
> **Judging Window:** November 16 – November 18, 2026 | **Results:** November 18, 23:59 UTC  
> **Total Prize Pool:** $250,000 (Paid in NEAR)

---

## 📌 1. Submission Details

- **Project Name:** PredicTEE
- **One-Line Description:** Verifiable TEE AI Oracle & Cross-Chain Prediction Resolution Engine powered by NEAR AI Cloud (Intel TDX + NVIDIA H100 NRAS) and NEAR Chain Signatures (`v1.signer`).
- **Matching Tracks (`tracks` array in Submission API):**
  - `privacy` — **Privacy & Private AI (Primary):** Confidential TEE AI inference (`cloud-api.near.ai`) with Intel TDX TD10 DCAP & NVIDIA NRAS hardware attestation and on-chain `near.ecrecover` verification.
  - `agents` — **Agent Economy:** Autonomous TEE oracle agents that earn escrowed `$NEAR` bounties by resolving subjective inquiries and dispatching cross-contract callbacks.
  - `defi` — **Unstoppable DeFi:** Cross-chain prediction market order preparation and EIP-712 signing on Polygon Polymarket CLOB via NEAR Chain Signatures (`v1.signer`).
- **Public GitHub Repository:** https://github.com/zhic49280-oss/predictee
- **Public X (Twitter) Demo Post Checklist:**
  - Attach a demo video (mandatory for local-runnable demos per `Q-012`)
  - State that PredicTEE was built at **NEAR HACKATHON**
  - Tag **`@NEARProtocol`** and **`#NEARHackathon`** (plus `@NearBuilders`, `@NEAR_hckthn`, `@NearLegion`)

---

## 🏗️ 2. NEAR Technology Implementation Matrix

| NEAR Technology | How It Powers PredicTEE | Implementation File | Verification Command |
| :--- | :--- | :--- | :--- |
| **NEAR AI Cloud (TEE)** | Live hardware attestation (`GET https://cloud-api.near.ai/v1/attestation/report`) verified via Intel DCAP (`dcap-qvl`) & NVIDIA NRAS (`v3/attest/gpu`); signed completions via `/v1/signature/{chat_id}` (`z-ai/glm-5.3-flash`, `Qwen/Qwen3.8-27B`) | `packages/agent/tee_engine.py`<br/>`packages/agent/verify_near_ai_tee.py` | `npm run verify:tee` |
| **NEAR Smart Contracts (`near-sdk-js`)** | Request-Fulfill Oracle with storage staking, on-chain EIP-191 `secp256k1` `near.ecrecover` verification of TEE `signingAddress`, bounty escrow, callback dispatch, and NEP-297 events | `packages/contracts/src/index.ts` | `npm run contracts:test` |
| **NEAR Chain Signatures (`v1.signer`)** | Canonical `secp256k1` epsilon KDF derivation (`near-mpc-recovery v0.1.0 epsilon derivation:{account},{path}`) from live `v1.signer` root public key + EIP-712 Polymarket CTF Exchange (`chainId=137`) order hashing | `packages/agent/chain_sig.py` | `npm run agent:test` |

---

## 🧪 3. Judge Verification Steps: "Do X, See Y"

### Step 1: Verify Live NEAR AI Cloud TEE Hardware Attestation (No API Key Needed)
- **Do:** `npm run verify:tee`
- **See:** Fetches a live hardware quote from `https://cloud-api.near.ai/v1/attestation/report` with a fresh 32-byte random `nonce`, verifies Intel TDX TD10 via Intel DCAP (`UpToDate`), verifies `report_data[0..32]` binds `signing_address` (`0x3b753b4406613c5e70ae640508632b600424fa0c`) and `report_data[32..64]` embeds `nonce`, and verifies NVIDIA H100 GPU attestation via NVIDIA NRAS (`True`).

### Step 2: Run Full Smart Contract & Agent Test Suite
- **Do:** `npm test`
- **See:** 8/8 NEAR Smart Contract simulation suites pass (including on-chain `near.ecrecover` verification and rejection of spoofed measurements / forged signatures / tampered outcomes) and 5/5 Python Agent suites pass.

### Step 3: Launch Interactive Web Dashboard & REST API
- **Do:** Run `.\start.bat` (Windows) or `bash ./start.sh` (Linux/macOS).
- **See:** Agent API starts on `http://127.0.0.1:8000` and Web UI opens on `http://localhost:5173`.

### Step 4: Trigger TEE Resolution in UI
- **Do:** Open `http://localhost:5173`, select pending request `req-3`, and click **"✨ Trigger TEE Resolution"**.
- **See:** Request transitions `PENDING` $\rightarrow$ `RESOLVED`, displaying outcome, confidence BPS, TDX `mr_td`/`rt_mr0` measurement, and EIP-191 ECDSA signature.

### Step 5: Prepare Cross-Chain Polymarket Order via NEAR MPC
- **Do:** Open **"⚡ Prediction Markets & Alpha"** tab, pick any live Polymarket market, and click **"Confirm & Sign via NEAR MPC"**.
- **See:** Computes `alice.near`'s canonical Polygon EVM address (`0xd9EfEf5d4bc96d747f817F8bCFc307591d377BfA`), generates the EIP-712 Order digest, and displays the `v1.signer` signature payload.

---

## 📄 4. License
MIT License — see [LICENSE](./LICENSE).
