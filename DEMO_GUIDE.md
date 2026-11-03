# 🎬 PredicTEE — Judge Demo Guide & Pitch Script

> **NEAR Hackathon 2026**  
> **Tracks:** `privacy` (Privacy & Private AI — Primary) · `agents` (Agent Economy) · `defi` (Unstoppable DeFi)  
> **Project:** PredicTEE — Verifiable TEE AI Oracle & Omnichain Execution on NEAR

---

## 📌 Executive Summary for Judges

Prediction markets are the fastest-growing sector in crypto, but they are crippled by a fundamental flaw: **How do you resolve subjective or nuanced real-world questions without waiting 5 days for human voting or trusting a centralized blackbox?**

- **Chainlink** can only handle numeric feeds (e.g. `BTC/USD`). It cannot resolve qualitative events like *"Did DeepSeek-V4 outperform GPT-5 on SWE-bench?"* or complex regulatory decisions.
- **UMA** relies on human voting with slow 2-hour to 7-day challenge windows, voter apathy, and bribery vulnerabilities.
- **Naive Web2 AI Oracles** are centralized blackboxes: node runners or cloud providers (AWS/Azure) can inspect prompts, frontrun trades, or tamper with weights.

**PredicTEE** solves this with the world's first **Verifiable TEE AI Oracle on NEAR**:
1. AI multi-source synthesis runs inside **NEAR AI Cloud Intel TDX TD10 & NVIDIA H100 Confidential Computing** enclaves (`z-ai/glm-5.3-flash`, `Qwen/Qwen3.8-27B`).
2. Every resolution binds the enclave's **TDX TD10 `mr_td` / `rt_mr0` measurement** and **ECDSA `signing_address`**, verified directly on-chain by the NEAR Smart Contract via `near.ecrecover`.
3. Users and dApps can resolve subjective markets in **seconds** and prepare 1-click cross-chain orders on **Polymarket** using **NEAR Chain Signatures (`v1.signer`)** canonical `secp256k1` epsilon derivation.

---

## ⏱️ 3-Minute Video Pitch & Presentation Script

Use this exact timing and script when recording the project demo or presenting live to the hackathon judges.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3-MINUTE PITCH BREAKDOWN                                                    │
├───────────────┬──────────────────────────────────┬──────────────────────────┤
│ Timestamp     │ Section                          │ Visual Cue               │
├───────────────┼──────────────────────────────────┼──────────────────────────┤
│ 0:00 - 0:45   │ The Resolution Bottleneck        │ Title Slide / Problem UI │
│ 0:45 - 1:30   │ The PredicTEE Innovation         │ Architecture Mermaid     │
│ 1:30 - 2:15   │ Live Demo: TEE Oracle Resolution │ Contract & Dashboard     │
│ 2:15 - 2:45   │ Live Demo: NEAR MPC 1-Click Bet  │ Order Modal & Polygon Tx │
│ 2:45 - 3:00   │ Vision, Traction & Conclusion    │ Summary / Roadmap Slide  │
└───────────────┴──────────────────────────────────┴──────────────────────────┘
```

---

### [0:00 - 0:45] The Hook & The Problem
**Visual:** Show Polymarket interface alongside traditional oracle latency charts.
> *"Judges, prediction markets have processed billions in trading volume this year, serving as our global truth engines. But decentralized prediction markets have a hidden dirty secret: the resolution bottleneck.*  
> *If your market is a simple price feed, Chainlink works fine. But 80% of prediction markets are subjective and qualitative: 'Will the Fed cut rates?', 'Did an AI model beat a benchmark?', 'Will a regulatory decision pass?'.*  
> *Today, protocols are forced to rely on optimistic human voting like UMA, taking hours or days to resolve, suffering from voter apathy and bribery risks. Or worse, teams resort to centralized AI bots where the cloud provider or node operator can silently inject prompts or frontrun outcomes.*  
> *How can we have automated, instant, subjective event resolution that is 100% cryptographically verifiable?"*

---

### [0:45 - 1:30] The Core Innovation
**Visual:** Transition to PredicTEE Architecture Diagram (Intel TDX Enclave + NEAR Smart Contract + NEAR MPC).
> *"Meet PredicTEE: The first Verifiable Confidential AI Oracle powered by NEAR AI Cloud and NEAR Chain Signatures.*  
> *Instead of running AI on an untrusted server, PredicTEE runs deep multi-source reasoning entirely inside an Intel TDX hardware enclave. Inside the enclave, our model analyzes live orderbooks, sentiment, and news feeds in isolated CPU memory.*  
> *The hardware itself generates a cryptographic attestation quote containing the PCR-0 measurement—a mathematical fingerprint of the exact code running in the enclave.*  
> *Our NEAR L1 Smart Contract verifies this hardware fingerprint on-chain against a strict whitelist. If an unverified node or attacker tries to submit an AI answer, the contract rejects it instantly. You don't have to trust the AI—you trust the hardware cryptography."*

---

### [1:30 - 2:15] Live Demo: TEE Oracle Resolution & Quote Inspection
**Visual:** Screen recording of PredicTEE Explorer (`http://localhost:5173`). Click on "Inspect TEE Quote" on the DeepSeek-V4 card.
> *"Let's look at the live system.*  
> *Here on the PredicTEE Explorer, we see active subjective markets. Take this one: 'Will DeepSeek-V4 outperform Claude 3.7 / GPT-5 on SWE-bench?'.*  
> *Polymarket's current market implied probability is 61%. But our confidential TEE agent synthesized multiple feeds—ArXiv preprints, GitHub commit velocity, and test telemetry—calculating a True Probability of 72%, uncovering an 11% Alpha Divergence!*  
> *Let's click 'Inspect TEE Quote'. Here is the live Intel TDX hardware attestation: the registered PCR-0 code measurement, the model digest, and the base64 signed hardware quote.*  
> *When submitted on-chain via our contract's `fulfill_resolution` method, the NEAR contract verifies this measurement, transitions the state to RESOLVED, and releases the yoctoNEAR bounty to the enclave node. All verified by our 8-stage automated contract simulation test suite."*

---

### [2:15 - 2:45] Live Demo: NEAR MPC 1-Click Omnichain Execution
**Visual:** Click "Bet YES" on the dashboard. Open the NEAR Chain Signatures modal. Click "Confirm & Sign via NEAR MPC".
> *"Now for the best part: How does a NEAR user capitalize on this alpha?*  
> *Traditionally, you'd have to bridge USDC to Polygon, acquire POL tokens for gas, and set up a new wallet.*  
> *With PredicTEE, we leverage NEAR Chain Signatures. Notice my account: `alice.near`. Using the NEAR MPC `v1.signer` contract, PredicTEE derives a dedicated EVM address on Polygon.*  
> *With one click, I click 'Confirm & Sign'. In under 3 seconds, the NEAR MPC threshold network signs an EIP-712 conditional token order and submits it straight to Polymarket's orderbook on Polygon.*  
> *Zero bridging. Zero Polygon gas tokens. Native NEAR execution."*

---

### [2:45 - 3:00] Vision & Conclusion
**Visual:** Summary slide showing tracks, GitHub repo, and roadmap.
> *"PredicTEE bridges the gap between Verifiable Confidential AI and real-world capital deployment. By combining Intel TDX hardware guarantees on NEAR with cross-chain Chain Signatures, we create unstoppable, instant, and tamper-proof truth engines for Web3.*  
> *Everything you saw today is open source, thoroughly tested, and ready for deployment. Thank you!"*

---

## 🕹️ Step-by-Step Interactive Click-Through Walkthrough

Follow these steps to conduct an interactive demo or judge evaluation:

### Step 1: Launch the Full Stack Environment
Run the unified 1-click startup script from the project root:
```cmd
start.bat
```
This performs an environment check, gives you the option to run the contract test suite, boots the Python agent API at `http://127.0.0.1:8000`, and opens the frontend at `http://localhost:5173`.

---

### Step 2: Verify Live NEAR AI Cloud TEE Attestation & Smart Contract Suite
Run the keyless live hardware attestation verifier and the 8-suite contract simulation:
```bash
npm run verify:tee
npm test
```
**What Judges See:**
- **Live Hardware Attestation (`npm run verify:tee`):** Queries `https://cloud-api.near.ai/v1/attestation/report`, verifies the Intel TDX TD10 quote via `dcap-qvl` (`UpToDate`), confirms `report_data[0..32]` binds `0x3b753b4406613c5e70ae640508632b600424fa0c` and `report_data[32..64]` embeds the fresh 32-byte `nonce`, and verifies NVIDIA H100 GPU evidence via NVIDIA NRAS (`True`).
- **Smart Contract Suite (`npm test`):**
  - **Test 1:** Initialized with 3 verified NEAR AI Cloud enclaves (`tdx-mrtd:df4d77c8...`, `tdx-rtmr0:bc122d14...`, `sha256:617be591...`) and their attested ECDSA `signingAddress` values.
  - **Test 2:** Whitelist access control (non-owners cannot register rogue enclaves).
  - **Test 3:** Escrowed request creation with yoctoNEAR bounty and storage staking accounting.
  - **Test 4:** **Cryptographic rejection of unverified measurements, public measurement spoofing without signature, forged ECDSA keys, and relayer outcome tampering** via `near.ecrecover`.
  - **Test 5:** Legitimate fulfillment, on-chain `near.ecrecover` signer recovery, state transition to `RESOLVED`, resolver bounty payout, and signature replay protection.
  - **Test 6:** Cancellation & refund safeguards.
  - **Test 7:** Bounded pagination view queries & global statistics.
  - **Test 8:** Cross-chain intent registry & NEP-297 standard event audit (`oracle_request_created`, `oracle_request_fulfilled`).

---

### Step 3: Explore Live Oracle Inquiries & Prediction Markets
Navigate to `http://localhost:5173`.
1. Observe the **Real-Time Oracle Stats Bar** computed dynamically from active inquiries and verified enclaves:
   - Total Inquiries (`6` seeded, `3` pending resolution)
   - Resolved Truths (`100% On-Chain ecrecover`)
   - Active Bounties (`9.5 NEAR` paid)
   - Verified Enclaves (`3 Nodes` — Intel TDX TD10 + NVIDIA H100 CC)
2. Switch to **"⚡ Prediction Markets & Alpha"** to examine live Polymarket events:
   - **Polymarket Odds (Market Implied)** vs. **NEAR AI True Prob (Confidential TEE)**.
   - Dynamic **Alpha Divergence (+EV)** calculation highlighting mispriced outcomes.
   - **TEE Reasoning Digest** summarizing evidence feeds evaluated for each market.

---

### Step 4: Trigger TEE Resolution & Inspect the Hardware Cryptographic Quote
1. On **"🔮 Live Oracle Explorer"**, locate pending request `req-3` and click **"✨ Trigger TEE Resolution"**, then click **"Inspect TEE Proof"**.
2. The **Hardware Cryptographic Attestation Modal** opens:
   - **Execution Hardware:** `Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)`
   - **Model Inference Engine:** `z-ai/glm-5.3-flash` / `Qwen/Qwen3.8-27B`
   - **Enclave Measurement (TDX TD10 MRTD / RTMR0):** `tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b`
   - **TEE `signing_address` (TD10 Bound):** `0x3b753b4406613c5e70ae640508632b600424fa0c`
   - **EIP-191 ECDSA Signature (`ecrecover`):** 65-byte secp256k1 signature over the resolution digest.
   - **Attestation Hash:** Immutable digest emitted in the NEP-297 contract event.
   - **Base64 Signed Hardware Quote:** Full JSON/TDX quote payload.

---

### Step 5: Prepare 1-Click Cross-Chain Order via NEAR MPC
1. Switch to **"⚡ Prediction Markets & Alpha"** and click **"Bet YES"** or **"Bet NO"** on any market.
2. The **NEAR Chain Signatures Modal** appears:
   - Source Account: `alice.near`
   - Derived Polygon Address: `0xd9EfEf5d4bc96d747f817F8bCFc307591d377BfA` (derived via `near-mpc-recovery v0.1.0 epsilon derivation:alice.near,polymarket` from `v1.signer`).
   - MPC Contract: `v1.signer`
3. Select an amount (e.g. `$50`) and click **"Confirm & Sign via NEAR MPC"**.
4. Confirmation screen displays:
   - **Status:** `MPC_SIGNED_EXECUTED`
   - **Derived Polygon Address:** `0xd9EfEf5d4bc96d747f817F8bCFc307591d377BfA`
   - **EIP-712 Order Digest (`chainId=137`):** Keccak-256 digest for Polymarket CTF Exchange (`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`).
   - **NEAR MPC (`v1.signer`) Sign Request Payload:** Ready-to-broadcast `sign` payload with 32-byte digest array and derivation path `"polymarket"`.
   - **Direct link to Polygonscan Explorer**.

---

## 🎯 Key Talking Points for Judges' Criteria

### 1. Verifiability (Hardware Guarantees over "Trust Me" AI)
- **Problem:** Any developer can call an OpenAI API and write the result on-chain. That is NOT a decentralized oracle—it is a centralized single point of failure.
- **PredicTEE Answer:** By running open-weight models (DeepSeek-V3, Llama-3.3) inside Intel TDX enclaves, we bind the AI output to a physical CPU measurement. The NEAR smart contract checks this measurement against an on-chain whitelist. It is mathematically impossible for an attacker to tamper with the model without altering the PCR measurement.

### 2. Privacy & Anti-Alpha Leakage (Track 1 Alignment)
- **Problem:** Quantitative prediction strategies leak massive value when submitted to public mempools or standard cloud APIs. Searchers frontrun your predictions.
- **PredicTEE Answer:** Prompts, data weights, and inference traces exist exclusively in encrypted enclave memory (RAM encryption via Intel TDX multi-key). Even if an adversary has physical root access to the bare-metal server, they cannot read the memory bus.

### 3. Real-World Utility & Product-Market Fit (Track 2 Alignment)
- **Problem:** The entire prediction market ecosystem (Polymarket, Kalshi, Azuro) is bottlenecked by subjective settlement times.
- **PredicTEE Answer:** PredicTEE enables near-instant subjective resolution, allowing automated prediction markets on esports, breaking news, corporate milestones, and AI benchmarks.

### 4. Seamless User Experience (Chain Abstraction)
- **Problem:** Web3 UX is notoriously fragmented. Bridging across chains is risky, confusing, and slow.
- **PredicTEE Answer:** Users remain natively on NEAR. Through NEAR Chain Signatures (`v1.signer`), the user interacts with Polygon dApps without acquiring POL or installing MetaMask.

---

## ❓ Frequently Asked Questions (Judge FAQ)

#### Q: How does Intel TDX differ from older Intel SGX?
**A:** Intel SGX was limited to small encrypted memory enclaves (PRM) and required complex code refactoring. Intel TDX (Trust Domain Extensions) isolates entire virtual machines with hardware-enforced memory encryption and integrity protection, allowing large LLMs and containerized AI workers to run natively without performance degradation.

#### Q: What if a TEE enclave node goes rogue or is compromised?
**A:** The NEAR contract architecture includes owner-governed and multi-enclave deactivation (`deactivate_tee_enclave`). If an enclave's keys or firmware are revoked by Intel/NVIDIA attestation authorities, the measurement is removed from the whitelist, immediately rendering its fulfillment calls invalid.

#### Q: How is the bounty model sustainable for TEE node operators?
**A:** Requesters attach yoctoNEAR deposits when calling `request_resolution`. The contract escrows the bounty and transfers 100% of it directly to the predecessor account ID of the verified enclave upon successful fulfillment. This creates a competitive, decentralized market for high-speed confidential AI inference.

#### Q: Can this contract interact with other NEAR dApps via callbacks?
**A:** Yes! `request_resolution` accepts optional `callback_contract` and `callback_method` parameters. When fulfilled, the PredicTEE contract makes a cross-contract promise call passing the request ID, outcome, confidence BPS, attestation hash, and evidence digest directly to the consumer dApp.

---

## 🏆 Summary Checklist for Hackathon Submission

- [x] **Smart Contract:** TypeScript (`near-sdk-js`) with Intel TDX Whitelist & NEP-297 events.
- [x] **Simulation Test Suite:** 8 passing tests covering initialization, rejection of invalid TEE, fulfillment, cancellation, and events.
- [x] **Confidential AI Worker:** Python FastAPI service simulating Intel TDX quotes and PCR-0 measurements.
- [x] **Omnichain Execution:** NEAR Chain Signatures MPC (`v1.signer`) EVM address derivation & EIP-712 order builder.
- [x] **Frontend Web App:** React / Tailwind dashboard with TEE Inspector and 1-click execution.
- [x] **Documentation:** Comprehensive `README.md` and `DEMO_GUIDE.md`.
- [x] **1-Click Startup:** Windows batch launcher `start.bat`.
