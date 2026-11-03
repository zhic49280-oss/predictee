import type { OracleRequestItem, EnclaveNodeItem, AccountOption, Market } from './types';

export const INITIAL_ACCOUNTS: AccountOption[] = [
  {
    accountId: 'alice.near',
    derivedPolygonAddress: '0xd9EfEf5d4bc96d747f817F8bCFc307591d377BfA',
    nearBalance: '42.50 NEAR',
    label: 'Primary Hackathon Demo Wallet'
  },
  {
    accountId: 'bob.near',
    derivedPolygonAddress: '0x05877f3cF28dc493C9Fb5B152a788547c6136fb1',
    nearBalance: '18.20 NEAR',
    label: 'Secondary Solver Agent'
  },
  {
    accountId: 'illia.near',
    derivedPolygonAddress: '0xc9DDB434636Df4fddC50C89aa7EfC610F7e98180',
    nearBalance: '150.00 NEAR',
    label: 'NEAR Ecosystem Foundation'
  }
];

export const INITIAL_ENCLAVES: EnclaveNodeItem[] = [
  {
    id: 'enc-intel-tdx',
    measurement: 'tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b',
    signingAddress: '0x3b753b4406613c5e70ae640508632b600424fa0c',
    label: 'NEAR AI Cloud Intel TDX Enclave TD10 (z-ai/glm-5.3-flash TEE)',
    hardware: 'Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)',
    model: 'z-ai/glm-5.3-flash (NEAR AI Cloud TEE)',
    active: true,
    registeredAt: '2026-10-15T08:00:00Z',
    totalResolutions: 2,
    uptime: '99.98%',
    attestationType: 'Intel TDX Quote v4.0 / DCAP + NVIDIA NRAS (Signer: 0x3b75...fa0c)',
    isolationGuarantee: 'Hardware-enforced TDX memory encryption; report_data[0..32] binds enclave ECDSA signing_address.'
  },
  {
    id: 'enc-nvidia-h100',
    measurement: 'tdx-rtmr0:bc122d143ab768565ba5c3774ff5f03a63c89a4df7c1f5ea38d3bd173409d14f8cbdcc36d40e703cccb996a9d9687590',
    signingAddress: '0x835ab53d20294ef795906dff21ae4c045336aa26',
    label: 'NEAR AI Cloud NVIDIA H100 Confidential GPU Enclave (Qwen/Qwen3.8-27B TEE)',
    hardware: 'NVIDIA H100 SXM5 80GB (Confidential Computing NRAS Verified)',
    model: 'Qwen/Qwen3.8-27B & Qwen/Qwen3.6-35B-A3B-FP8 (NEAR AI Cloud TEE)',
    active: true,
    registeredAt: '2026-10-20T12:00:00Z',
    totalResolutions: 1,
    uptime: '99.95%',
    attestationType: 'NVIDIA NRAS v3 GPU Attestation + Intel TDX RTMR0 (Signer: 0x835a...aa26)',
    isolationGuarantee: 'Isolated GPU VRAM execution verified via NVIDIA Remote Attestation Service (NRAS).'
  },
  {
    id: 'enc-phala-dstack',
    measurement: 'sha256:617be5914d178c435050db0af275a67317fcf3e6c0fa94c4b433e2c58e8e93fe',
    signingAddress: '0xb98a789cdc4817275f5155593ba73ef2a957e779',
    label: 'NEAR AI Cloud Phala / Dstack Compose-Manager Gateway TEE',
    hardware: 'Dstack Compose-Manager TDX Gateway Enclave',
    model: 'cloud-api.near.ai Gateway & Compose-Manager Verifier',
    active: true,
    registeredAt: '2026-10-25T16:00:00Z',
    totalResolutions: 0,
    uptime: '100.0%',
    attestationType: 'Dstack Compose-Manager Canonical Actions SHA-256 (Signer: 0xb98a...e779)',
    isolationGuarantee: 'Verifiable container image digest provenance via Sigstore and canonical compose actions_hash.'
  }
];

export const INITIAL_ORACLE_REQUESTS: OracleRequestItem[] = [
  {
    requestId: 'req-3',
    requester: 'sam.near',
    query: 'Will OpenAI release GPT-5 or Orion publicly before March 31, 2027?',
    category: 'AI Benchmarks',
    bountyNear: 7.5,
    bountyYocto: '7500000000000000000000000',
    status: 'PENDING',
    createdAt: '1730602000000000000',
    resolvedAt: null,
    callbackContract: 'polymarket-oracle-bridge.near',
    callbackMethod: 'receive_resolution',
    evidenceSources: [
      { name: 'OpenAI Official Blog & Newsroom', weight: 0.40, stance: 'Next-gen frontier models in alignment red-teaming' },
      { name: 'USPTO Trademark & Copyright Filings', weight: 0.35, stance: 'GPT-5 commercial trademark registrations active' },
      { name: 'OpenAI API Public Endpoint Tracker', weight: 0.25, stance: 'Staging model endpoints detected' }
    ],
    resolution: null
  },
  {
    requestId: 'req-6',
    requester: 'carol.near',
    query: 'Will SpaceX Starship Flight 8 achieve successful booster catch and payload orbital insertion?',
    category: 'Global Events',
    bountyNear: 4.0,
    bountyYocto: '4000000000000000000000000',
    status: 'PENDING',
    createdAt: '1730601000000000000',
    resolvedAt: null,
    callbackContract: 'mars-bets.near',
    callbackMethod: 'payout_winners',
    evidenceSources: [
      { name: 'Public Resolution Criteria Check', weight: 0.40, stance: 'Primary event resolution source validation' },
      { name: 'Prediction Market Orderbook Implied Odds', weight: 0.35, stance: 'Volume-weighted implied probability baseline' },
      { name: 'Bayesian Base-Rate Prior (Heuristic)', weight: 0.25, stance: 'Historical base-rate prior across comparable propositions' }
    ],
    resolution: null
  },
  {
    requestId: 'req-5',
    requester: 'bob.near',
    query: 'Will US Headline CPI for October 2026 print below 2.4% annualized?',
    category: 'Macro & Fed',
    bountyNear: 1.5,
    bountyYocto: '1500000000000000000000000',
    status: 'PENDING',
    createdAt: '1730600000000000000',
    resolvedAt: null,
    callbackContract: null,
    callbackMethod: null,
    evidenceSources: [
      { name: 'Macro Interest Rate & FOMC Policy Prior (Domain Baseline)', weight: 0.40, stance: 'FOMC dot-plot and short-end yield curve baseline distribution' },
      { name: 'Core CPI / PCE Inflation Trend Component', weight: 0.35, stance: 'Trailing 3-month annualized core inflation trajectory' },
      { name: 'Prediction Market Consensus Implied Odds', weight: 0.25, stance: 'Cross-market implied probability anchor' }
    ],
    resolution: null
  },
  {
    requestId: 'req-4',
    requester: 'alex.near',
    query: 'Will NEAR Chain Signatures settle over 100,000 cross-chain transactions daily in Q4 2026?',
    category: 'NEAR Ecosystem',
    bountyNear: 2.0,
    bountyYocto: '2000000000000000000000000',
    status: 'RESOLVED',
    createdAt: '1730595000000000000',
    resolvedAt: '1730598000000000000',
    callbackContract: null,
    callbackMethod: null,
    evidenceSources: [
      { name: 'NEAR Chain Signatures MPC Telemetry', weight: 0.45, stance: 'v1.signer cross-chain signature volume tracking' },
      { name: 'Polymarket Gamma CLOB Orderbook Telemetry', weight: 0.35, stance: 'Orderbook implied probability & 24h volume depth' },
      { name: 'Fast NEAR Protocol RPC Active Account Index', weight: 0.20, stance: 'Active contract interaction telemetry' }
    ],
    resolution: {
      requestId: 'req-4',
      outcome: 'YES',
      confidenceBps: 9620,
      attestationHash: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
      enclaveMeasurement: 'tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b',
      evidenceDigest: '0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
      signerAddress: '0x3b753b4406613c5e70ae640508632b600424fa0c',
      signedText: 'z-ai/glm-5.3-flash:6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
      ecdsaSignature: '0x8d4f2c19a7e305b6d81249f0c3a5e71b94d206f8a1c3e5b7d9f0123456789abc4e2f1a09b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e11b',
      resolver: 'tee-node-intel-02.near',
      resolvedAt: '1730598000000000000',
      hardware: 'Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)',
      model: 'z-ai/glm-5.3-flash',
      attestationQuoteB64: 'eyJ2ZXJzaW9uIjogIk5FQVJfQUlfQ0xPVURfVERYX0RDQVBfVjQiLCAidGVlX2hhcmR3YXJlIjogIkludGVsIFREWCIsICJwY3IwX21lYXN1cmVtZW50IjogInRkeC1tcnRkOmRmNGQ3N2M4NTdkZTY1MmJkMGZhZmEzNDNhMjAyNmI1MTA3MWVlMDM3NzNkMDc2ZDI4M2FiZjFhN2QzNmZmOTFmZmEyNzllZTRhNjE3YWM2NjRmN2UyYTJjOGQ1ODkxYiIsICJ0YXJnZXRfaWQiOiAicmVxLTQifQ==',
      zeroKnowledgeGuarantee: 'No user prompts or model states recorded to persistent storage.',
      rationale: 'NEAR RPC telemetry and v1.signer MPC activity confirm sustained cross-chain signature volume.'
    }
  },
  {
    requestId: 'req-2',
    requester: 'illia.near',
    query: 'Will DeepSeek-V4 achieve top-1 rank on LMSYS Chatbot Arena before Dec 2026?',
    category: 'AI Benchmarks',
    bountyNear: 5.0,
    bountyYocto: '5000000000000000000000000',
    status: 'RESOLVED',
    createdAt: '1730593000000000000',
    resolvedAt: '1730596000000000000',
    callbackContract: null,
    callbackMethod: null,
    evidenceSources: [
      { name: 'SWE-bench & Open LLM Evaluation Criteria', weight: 0.45, stance: 'Published pass@1 verification criteria on canonical test split' },
      { name: 'NEAR AI Cloud Confidential Enclave Telemetry', weight: 0.30, stance: 'Intel TDX TD10 + NVIDIA H100 TEE model attestation status' },
      { name: 'Reproducible Weight & Benchmark Release Audit', weight: 0.25, stance: 'Public checkpoint and evaluation harness verification' }
    ],
    resolution: {
      requestId: 'req-2',
      outcome: 'YES',
      confidenceBps: 9240,
      attestationHash: '0x7c8b9a0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      enclaveMeasurement: 'tdx-rtmr0:bc122d143ab768565ba5c3774ff5f03a63c89a4df7c1f5ea38d3bd173409d14f8cbdcc36d40e703cccb996a9d9687590',
      evidenceDigest: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      signerAddress: '0x835ab53d20294ef795906dff21ae4c045336aa26',
      signedText: 'Qwen/Qwen3.8-27B:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b:7c8b9a0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      ecdsaSignature: '0x5c9a1e3f7b2d40689a1c3e5f7b9d02468ace13579bdf02468ace13579bdf02463a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b1c',
      resolver: 'tee-node-h100-01.near',
      resolvedAt: '1730596000000000000',
      hardware: 'NVIDIA H100 SXM5 80GB (Confidential Computing NRAS Verified)',
      model: 'Qwen/Qwen3.8-27B',
      attestationQuoteB64: 'eyJ2ZXJzaW9uIjogIk5FQVJfQUlfQ0xPVURfVERYX0RDQVBfVjQiLCAidGVlX2hhcmR3YXJlIjogIk5WSURJQSBIMTAwIiwgInBjcjBfbWVhc3VyZW1lbnQiOiAidGR4LXJ0bXIwOmJjMTIyZDE0M2FiNzY4NTY1YmE1YzM3NzRmZjVmMDNhNjNjODlhNGRmN2MxZjVlYTM4ZDNiZDE3MzQwOWQxNGY4Y2JkY2MzNmQ0MGU3MDNjY2NiOTk2YTlkOTY4NzU5MCIsICJ0YXJnZXRfaWQiOiAicmVxLTIifQ==',
      zeroKnowledgeGuarantee: 'Evaluated in isolated GPU VRAM enclave. Zero host observation.',
      rationale: 'Benchmark evaluation runs indicate leading ELO performance across coding and reasoning tasks.'
    }
  },
  {
    requestId: 'req-1',
    requester: 'vitalik.near',
    query: 'Will the Federal Reserve cut interest rates by 25 bps in December 2026?',
    category: 'Macro & Fed',
    bountyNear: 2.5,
    bountyYocto: '2500000000000000000000000',
    status: 'RESOLVED',
    createdAt: '1730592000000000000',
    resolvedAt: '1730595600000000000',
    callbackContract: 'polymarket-oracle-bridge.near',
    callbackMethod: 'receive_resolution',
    evidenceSources: [
      { name: 'Macro Interest Rate & FOMC Policy Prior (Domain Baseline)', weight: 0.40, stance: 'FOMC dot-plot and short-end yield curve baseline distribution' },
      { name: 'Core CPI / PCE Inflation Trend Component', weight: 0.35, stance: 'Trailing 3-month annualized core inflation trajectory' },
      { name: 'Prediction Market Consensus Implied Odds', weight: 0.25, stance: 'Cross-market implied probability anchor' }
    ],
    resolution: {
      requestId: 'req-1',
      outcome: 'NO',
      confidenceBps: 8950,
      attestationHash: '0x3f9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f',
      enclaveMeasurement: 'tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b',
      evidenceDigest: '0x8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
      signerAddress: '0x3b753b4406613c5e70ae640508632b600424fa0c',
      signedText: 'z-ai/glm-5.3-flash:8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b:3f9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f',
      ecdsaSignature: '0x7e4a9c2d1f8b3056a7c9e1d3f5b7092468ace13579bdf02468ace13579bdf0242b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c1b',
      resolver: 'tee-node-intel-01.near',
      resolvedAt: '1730595600000000000',
      hardware: 'Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX TD10)',
      model: 'z-ai/glm-5.3-flash',
      attestationQuoteB64: 'eyJ2ZXJzaW9uIjogIk5FQVJfQUlfQ0xPVURfVERYX0RDQVBfVjQiLCAidGVlX2hhcmR3YXJlIjogIkludGVsIFREWCIsICJwY3IwX21lYXN1cmVtZW50IjogInRkeC1tcnRkOmRmNGQ3N2M4NTdkZTY1MmJkMGZhZmEzNDNhMjAyNmI1MTA3MWVlMDM3NzNkMDc2ZDI4M2FiZjFhN2QzNmZmOTFmZmEyNzllZTRhNjE3YWM2NjRmN2UyYTJjOGQ1ODkxYiIsICJ0YXJnZXRfaWQiOiAicmVxLTEifQ==',
      zeroKnowledgeGuarantee: 'No user prompts or model states recorded to persistent storage.',
      rationale: 'Short-end rate futures and trailing core inflation baseline favor a policy hold.'
    }
  }
];

export const FALLBACK_MARKETS_DATA: Market[] = [
  {
    id: "pm-fed-dec-2026",
    title: "Fed Rate Decision in December 2026: 25 bps Hike?",
    category: "Macro & Fed",
    volume_usd: "$24,850,000",
    end_date: "2026-12-16",
    market_prob: 0.38,
    token_id_yes: "0x4f128c71b690e84b5e28a9c80d4e3b1c",
    token_id_no: "0x5a239d82c701f95c6f39b0d91e5f4c2d",
    evidence_sources: [
      { name: "FedWatch Futures Curve", weight: 0.45, stance: "Hawkish bias post 10-2 FOMC dissent" },
      { name: "Core PCE Print (Sep)", weight: 0.30, stance: "0.3% MoM sticky inflation reading" },
      { name: "Chair Warsh Press Conference Transcript", weight: 0.25, stance: "Data-dependent, open to tightening" }
    ],
    ai_analysis: {
      ai_true_prob: 0.52,
      alpha_divergence: 0.14,
      recommended_action: "BUY_YES",
      expected_roi_percent: 36.8,
      confidence_level: "High (91.2%)",
      rationale: "Evaluated telemetry feeds against Polymarket orderbook (+14.0% divergence; suggested action: BUY_YES).",
      tee_attestation: {
        is_tee_verified: true,
        hardware: "NEAR AI Cloud Intel TDX / NVIDIA H100 Confidential GPU",
        enclave_measurement: "tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b",
        attested_signing_address: "0x3b753b4406613c5e70ae640508632b600424fa0c",
        signer_address: "0x3b753b4406613c5e70ae640508632b600424fa0c",
        signed_text: "z-ai/glm-5.3-flash:pm-fed-dec-2026:0x9c82fa0184b23d91e0a4f5c2b7d903e18a4c2f8190d7e63b1a2c5e4f8d9b0a1c",
        ecdsa_signature: "0x6b2d8e4f1a3c5079b2d4e6f8a0c2e416385a7c9e1b3d5f7092b4d6e8f0a1c3e52a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b1b",
        attestation_quote_b64: "eyJ2ZXJzaW9uIjogIk5FQVJfQUlfQ0xPVURfVERYX0RDQVBfVjQiLCAidGFyZ2V0X2lkIjogInBtLWZlZC1kZWMtMjAyNiJ9",
        attestation_hash: "0x9c82fa0184b23d91e0a4f5c2b7d903e18a4c2f8190d7e63b1a2c5e4f8d9b0a1c",
        model: "z-ai/glm-5.3-flash",
        timestamp: 1793613000,
        zero_knowledge_log_guarantee: "No user prompts or model states recorded to persistent storage."
      }
    }
  }
];
