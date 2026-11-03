# 🔮 HACKATHON.md — PredicTEE: Verifiable TEE AI Oracle on NEAR

> **Official NEAR Hackathon 2026 Submission Document**  
> **Event Timeline:** November 1, 00:00 UTC – November 14, 23:59 UTC, 2026  
> **Evaluation Window:** November 16 – November 18, 2026 | **Results:** November 18, 23:59 UTC  
> **Total Prize Pool:** $250,000

---

## 📌 1. Submission Overview

- **Project Name:** PredicTEE
- **Tagline:** Confidential AI Oracle & Omnichain Prediction Resolution Engine powered by NEAR AI Cloud (TEE) and NEAR Chain Signatures (MPC).
- **Target Tracks:**
  1. `ai-agents` — Autonomous Intelligent Agents on NEAR AI Cloud (Primary Track)
  2. `chain-signatures` — Cross-Chain Execution & Chain Abstraction via `v1.signer` (Secondary Track)
  3. `near-intents` — Declarative Request-Fulfill Oracle & Solver Settlement
- **Public GitHub Repository:** [Your GitHub Repository URL]
- **Public X (Twitter) Demo Post:** [Your X Demo Post URL]
- **Video Walkthrough (3-Minute):** [Loom / YouTube Video URL]

---

## 💡 2. Executive Summary & Problem-Solution Fit

### The Problem
Decentralized prediction markets (such as Polymarket on Polygon) and DeFi protocols face two critical bottlenecks:
1. **Sluggish, Subjective Oracles**: Optimistic oracles (like UMA) rely on slow token-holder voting rounds taking 2 hours to 7 days, incurring high capital lockup costs and subjective bias/bribery risks.
2. **Cross-Chain Capital & Key Friction**: Users must bridge assets, maintain foreign gas tokens (MATIC/POL), and manage fragmented keys across chains.
3. **Unverified Blackbox AI**: Traditional Web2 AI oracles leak prompt alpha, can be tampered with by cloud hosts, and provide zero cryptographic proof of model integrity.

### The PredicTEE Solution
**PredicTEE** unifies NEAR's three flagship technologies into a production-grade, verifiable confidential oracle:
- 🛡️ **Verifiable TEE AI Inference (NEAR AI Cloud)**: DeepSeek-V3 / Llama-3.3 runs exclusively inside Intel TDX / NVIDIA Confidential Computing enclaves. Every resolution generates an immutable cryptographic hardware attestation quote (PCR-0 code measurement).
- 📝 **NEAR L1 Oracle Smart Contract**: Implements a standard Request-Fulfill lifecycle with escrowed bounty payouts, hardware enclave whitelisting, and NEP-297 standard event logging.
- ⚡ **Omnichain 1-Click Execution (NEAR Chain Signatures)**: Users and agents interact natively using their NEAR account (`alice.near`). The decentralized NEAR MPC network (`v1.signer`) signs EIP-712 orders directly to Polymarket on Polygon without the user needing Polygon keys or gas tokens.

---

## 🏗️ 3. NEAR Technology Implementation Matrix

| NEAR Core Technology | Role in PredicTEE | Implementation File | Verification Test |
| :--- | :--- | :--- | :--- |
| **NEAR AI Cloud (TEE)** | Intel TDX / NVIDIA H100 hardware attestation quotes, PCR-0 code fingerprints, multi-source evidence synthesis | `packages/agent/tee_engine.py` | `python packages/agent/test_agent.py` (Test 2) |
| **NEAR Chain Signatures (MPC)** | Cross-chain EIP-712 order signing via `v1.signer`, secp256k1 EVM address derivation from NEAR accounts | `packages/agent/chain_sig.py` | `python packages/agent/test_agent.py` (Test 3) |
| **NEAR Smart Contracts** | Request-Fulfill Oracle contract, on-chain bounty escrow, TEE whitelist enforcement, NEP-297 events | `packages/contracts/src/index.ts` | `npm run contracts:test` (8/8 Suites Passed) |
| **NEAR Intents** | Declarative resolution ticket creation (`request_resolution`) and autonomous solver execution | `packages/agent/agent.py` | `python packages/agent/test_agent.py` (Test 4) |

---

## 🧪 4. Judge Verification Guide: "Do X, See Y" (AI & Human Judges)

> **Official Guideline Compliance:** *Follow the guidance in HACKATHON.md: give judges clear steps to try your prototype, with an expected result for each step – “do X, see Y”.*

Judges and automated review agents (Claude Code & Codex) can audit the protocol with zero setup:

### Step 1: Run Full Protocol Regression Test
- **Do:** `npm test`
- **See:** 8/8 NEAR Smart Contract tests pass with NEP-297 events, followed by 5/5 Python Agent suites passing with Intel TDX / NVIDIA H100 attestation quotes and MPC signature validation.

### Step 2: Test NEAR Smart Contract Directly
- **Do:** `npm run contracts:test`
- **See:** Smart contract validates whitelist, rejects unverified enclaves (`sha256:000...deadbeef`), locks bounty in escrow, and executes `fulfill_resolution` payout.

### Step 3: Test Confidential AI Agent & Chain Signatures API
- **Do:** `npm run agent:test`
- **See:** FastAPI REST endpoints serve `/api/oracle/*`, generates cryptographic attestation quotes, and derives secp256k1 EVM addresses for Polygon Polymarket orders.

### Step 4: Launch Web Dashboard & Microservices
- **Do:** Double-click `start.bat` (or run `.\start.bat` in terminal).
- **See:** Two titled service windows open: Backend API on `http://127.0.0.1:8000` and Vite Web UI on `http://localhost:5173`.

### Step 5: Test Oracle Resolution in UI
- **Do:** Open `http://localhost:5173`, find pending inquiry (`req-3`), and click **"✨ Trigger TEE Resolution"**.
- **See:** Status transitions from `AWAITING TEE ATTESTATION` to `RESOLVED`, displays 91%+ conviction score, verified evidence digest, and releases 7.5 NEAR bounty to solver node.

### Step 6: Test Cross-Chain Omnichain Bet
- **Do:** Switch to **"⚡ Prediction Markets & Alpha"** tab, pick a live Polymarket event, select $50 bet, and click **"Confirm & Sign via NEAR MPC"**.
- **See:** NEAR MPC signs order, Polygon transaction hash is issued, and `alice.near` wallet balance automatically deducts 10 NEAR!

---

## 🚀 5. Quickstart & Service References

- **Interactive Oracle Explorer UI:** `http://localhost:5173`
- **Confidential AI Agent REST API:** `http://127.0.0.1:8000`
- **Interactive Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **Judge Video Pitch Script & Walkthrough:** Follow [DEMO_GUIDE.md](./DEMO_GUIDE.md) for a timestamped 3-minute presentation.

---

## 👥 6. Team & Open Source Declaration

- **License:** MIT License
- **Frameworks:** `near-sdk-js`, `FastAPI`, `React`, `Vite`, `TailwindCSS`
- Built exclusively for the **NEAR Hackathon 2026** ($250,000 Prize Pool).
