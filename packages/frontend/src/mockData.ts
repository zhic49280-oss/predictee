import type { OracleRequestItem, EnclaveNodeItem, AccountOption, Market } from './types';

export const INITIAL_ACCOUNTS: AccountOption[] = [
  {
    accountId: 'alice.near',
    derivedPolygonAddress: '0x7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f',
    nearBalance: '42.50 NEAR',
    label: 'Primary Hackathon Demo Wallet'
  },
  {
    accountId: 'bob.near',
    derivedPolygonAddress: '0x3b8c4d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c',
    nearBalance: '18.20 NEAR',
    label: 'Secondary Solver Agent'
  },
  {
    accountId: 'illia.near',
    derivedPolygonAddress: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
    nearBalance: '150.00 NEAR',
    label: 'NEAR Ecosystem Foundation'
  }
];

export const INITIAL_ENCLAVES: EnclaveNodeItem[] = [
  {
    id: 'enc-intel-tdx',
    measurement: 'sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0',
    label: 'NEAR AI Cloud Intel TDX Enclave v1.0',
    hardware: 'Intel® Xeon® Platinum 8592+ (Emerald Rapids TDX)',
    model: 'deepseek-ai/DeepSeek-V3-Confidential & Llama-3.3-70B-TEE',
    active: true,
    registeredAt: '2026-10-15T08:00:00Z',
    totalResolutions: 84,
    uptime: '99.98% (42d)',
    attestationType: 'Intel TDX Quote v4.0 / DCAP ECDSA-p256',
    isolationGuarantee: 'Zero-Knowledge RAM isolation. OS and Hypervisor cannot inspect or alter register or memory states.'
  },
  {
    id: 'enc-nvidia-h100',
    measurement: 'sha256:8b1e45f92a3c7d60e145b2f8a9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f',
    label: 'NEAR AI Cloud NVIDIA H100 Confidential GPU Enclave',
    hardware: 'NVIDIA H100 SXM5 80GB (Confidential Computing Mode)',
    model: 'deepseek-ai/DeepSeek-V3-Confidential (8-way MoE Tensor Parallelism)',
    active: true,
    registeredAt: '2026-10-20T12:00:00Z',
    totalResolutions: 46,
    uptime: '99.95% (28d)',
    attestationType: 'NVIDIA SPDM / GPU Attestation Protocol v1.1',
    isolationGuarantee: 'Isolated GPU VRAM execution. Firmware attestation cryptographically linked to NVIDIA Silicon Root of Trust.'
  },
  {
    id: 'enc-phala-dstack',
    measurement: 'sha256:4d6f8a2e1c3b5a790f8e2d4b6a8c0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d',
    label: 'Phala / Dstack Intel SGX+TDX Attested Node',
    hardware: 'Phala Cloud Distributed Gramine Enclave Runner',
    model: 'Multi-party Consensus Verifier & Cross-Enclave Validator',
    active: true,
    registeredAt: '2026-10-25T16:00:00Z',
    totalResolutions: 18,
    uptime: '100.0% (14d)',
    attestationType: 'Gramine / Dstack SGX DCAP Attestation',
    isolationGuarantee: 'Independent third-party multi-prover verification ensuring zero cloud host tampering.'
  }
];

export const INITIAL_ORACLE_REQUESTS: OracleRequestItem[] = [
  {
    requestId: 'req-1',
    requester: 'illia.near',
    query: 'Did Fed cut the Federal Funds target rate by 25+ bps in Dec 2026 FOMC?',
    category: 'Macro Economics',
    bountyNear: 5.0,
    bountyYocto: '5000000000000000000000000',
    status: 'RESOLVED',
    createdAt: '2026-12-16T18:00:00Z',
    resolvedAt: '2026-12-16T19:05:22Z',
    callbackContract: 'polymarket-oracle-bridge.near',
    callbackMethod: 'receive_resolution',
    evidenceSources: [
      { name: 'FOMC Press Release Dec 2026', weight: 0.45, stance: 'Target range lowered by 25 bps to 4.25%-4.50%' },
      { name: 'CME FedWatch Effective Rate', weight: 0.35, stance: 'Effective fed funds rate printed at 4.33%' },
      { name: 'BLS CPI Headline Print', weight: 0.20, stance: 'Inflation cooled to 2.4% annualized' }
    ],
    resolution: {
      requestId: 'req-1',
      outcome: 'YES',
      confidenceBps: 9420,
      attestationHash: '0x8f4d92a1c0e3b5a7824b6e71f9c0d2a83e5f1b4c90d8a2e1b7c3f5d9a0b4e2c',
      enclaveMeasurement: 'sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0',
      evidenceDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      resolver: 'tdx-enclave-01.near',
      resolvedAt: '2026-12-16T19:05:22Z',
      hardware: 'Intel® Xeon® 5th Gen (Emerald Rapids TDX)',
      model: 'deepseek-ai/DeepSeek-V3-Confidential',
      attestationQuoteB64: 'TURneE5UYzBNVGt6TXpndU5EZzJNREV3T1RFM05qRTFNVEV3TlRVek1UTXpPVFU9T1RFM05qRTFNVEV3TlRVek1UTXpPVFU=',
      zeroKnowledgeGuarantee: 'No user prompts or model states recorded to persistent storage. Intel TDX memory encryption active.'
    }
  },
  {
    requestId: 'req-2',
    requester: 'vitalik.near',
    query: 'Did Solana (SOL) market cap flip Ethereum (ETH) before end of 2026?',
    category: 'Crypto & DeFi',
    bountyNear: 10.0,
    bountyYocto: '10000000000000000000000000',
    status: 'RESOLVED',
    createdAt: '2026-12-25T10:15:00Z',
    resolvedAt: '2026-12-31T23:59:59Z',
    callbackContract: 'eth-sol-settlement.near',
    callbackMethod: 'payout_settlement',
    evidenceSources: [
      { name: 'CoinGecko & CMC Aggregate API', weight: 0.50, stance: 'ETH market cap $412B vs SOL market cap $128B' },
      { name: 'DEXScreener Liquidity Index', weight: 0.30, stance: '3.22x circulating valuation ratio maintained' },
      { name: 'Binance Spot Weighted Index', weight: 0.20, stance: 'No flipping event registered during target window' }
    ],
    resolution: {
      requestId: 'req-2',
      outcome: 'NO',
      confidenceBps: 9870,
      attestationHash: '0x3a7b9c1d3e5f7a9b1c3d4d6f8a2e1c3b5a790f8e2d4b6a8c0e1f3a5b7c9d1e3f',
      enclaveMeasurement: 'sha256:8b1e45f92a3c7d60e145b2f8a9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f',
      evidenceDigest: 'sha256:f1d2d2f924e986ac86fdf7b36c94bcdf32beec15defc43d52d9a9ff590a3692d',
      resolver: 'h100-enclave-gpu.near',
      resolvedAt: '2026-12-31T23:59:59Z',
      hardware: 'NVIDIA H100 SXM5 80GB (Confidential Computing)',
      model: 'deepseek-ai/DeepSeek-V3-Confidential',
      attestationQuoteB64: 'T1RFM05qRTFNVEV3TlRVek1UTXpPVFVtTURneE5UYzBNVGt6TXpndU5EZzJNREV3TURneE5UYzBNVGt6TXpndU5EZzJNREV3',
      zeroKnowledgeGuarantee: 'Evaluated in isolated GPU VRAM enclave. Zero host observation.'
    }
  },
  {
    requestId: 'req-3',
    requester: 'sam.near',
    query: 'Will OpenAI release GPT-5 or Orion publicly before March 31, 2027?',
    category: 'AI Milestones',
    bountyNear: 7.5,
    bountyYocto: '7500000000000000000000000',
    status: 'PENDING',
    createdAt: '2026-11-02T14:20:00Z',
    resolvedAt: null,
    callbackContract: 'polymarket-oracle-bridge.near',
    callbackMethod: 'receive_resolution',
    evidenceSources: [
      { name: 'OpenAI Official Blog & Newsroom', weight: 0.40, stance: 'Next-gen frontier models in alignment red-teaming' },
      { name: 'USPTO Trademark & Copyright Filings', weight: 0.35, stance: 'GPT-5 commercial trademark registrations active' },
      { name: 'OpenAI API Public Endpoint Tracker', weight: 0.25, stance: 'No public beta model flag deployed yet' }
    ],
    resolution: null
  },
  {
    requestId: 'req-4',
    requester: 'satoshi-vault.near',
    query: 'Did Bitcoin daily close price stay above $95,000 during the first week of November 2026?',
    category: 'Crypto & DeFi',
    bountyNear: 3.0,
    bountyYocto: '3000000000000000000000000',
    status: 'RESOLVED',
    createdAt: '2026-11-01T00:00:00Z',
    resolvedAt: '2026-11-03T01:00:00Z',
    callbackContract: null,
    callbackMethod: null,
    evidenceSources: [
      { name: 'Coinbase BTC/USD 00:00 UTC Close', weight: 0.40, stance: 'Daily close low was $96,420 (Nov 1)' },
      { name: 'Binance BTC/USDT Settlement Index', weight: 0.35, stance: 'All 7 daily candles closed above $96,380' },
      { name: 'Kraken BTC/USD 24h VWAP', weight: 0.25, stance: 'Weekly median VWAP $98,150' }
    ],
    resolution: {
      requestId: 'req-4',
      outcome: 'YES',
      confidenceBps: 9940,
      attestationHash: '0x12c4b8e90a7d5f3c1b6a8e0f2d4b6a8c0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b',
      enclaveMeasurement: 'sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0',
      evidenceDigest: 'sha256:68b329da9893e34099c7d8ad5cb9c940cac22409743717df3d21b79f667104b9',
      resolver: 'tdx-enclave-01.near',
      resolvedAt: '2026-11-03T01:00:00Z',
      hardware: 'Intel® Xeon® 5th Gen (Emerald Rapids TDX)',
      model: 'deepseek-ai/DeepSeek-V3-Confidential',
      attestationQuoteB64: 'TURneE5UYzBNVGt6TXpndU5EZzJNREV3T1RFM05qRTFNVEV3TlRVek1UTXpPVFU9T1RFM05qRTFNVEV3TlRVek1UTXpPVFU=',
      zeroKnowledgeGuarantee: 'Cryptographic proof validated against on-chain verified measurement whitelist.'
    }
  },
  {
    requestId: 'req-5',
    requester: 'ecb-watcher.near',
    query: 'Will the European Central Bank (ECB) cut interest rates below 2.50% at the next meeting?',
    category: 'Macro Economics',
    bountyNear: 4.0,
    bountyYocto: '4000000000000000000000000',
    status: 'PENDING',
    createdAt: '2026-11-03T02:10:00Z',
    resolvedAt: null,
    callbackContract: null,
    callbackMethod: null,
    evidenceSources: [
      { name: 'ECB Governing Council Policy Statements', weight: 0.45, stance: 'Lagarde noted disinflation is on track' },
      { name: 'Eurostat Flash Harmonized Inflation HICP', weight: 0.35, stance: 'Eurozone headline print dropped to 1.9%' },
      { name: 'Euribor 3-Month Futures Yield Curve', weight: 0.20, stance: 'Markets pricing 88% probability of 25 bps cut' }
    ],
    resolution: null
  },
  {
    requestId: 'req-6',
    requester: 'mars-dao.near',
    query: 'Will SpaceX Starship Flight 8 achieve successful booster catch and payload orbital insertion?',
    category: 'Global Events',
    bountyNear: 6.0,
    bountyYocto: '6000000000000000000000000',
    status: 'PENDING',
    createdAt: '2026-11-03T02:30:00Z',
    resolvedAt: null,
    callbackContract: 'mars-bets.near',
    callbackMethod: 'payout_winners',
    evidenceSources: [
      { name: 'FAA Commercial Space Launch License Log', weight: 0.40, stance: 'License modification approved for upgraded chopstick arms' },
      { name: 'SpaceX Mission Control Public Telemetry', weight: 0.40, stance: 'Static fire 33 Raptor engines completed successfully' },
      { name: 'Boca Chica Flight Operations NOTAM', weight: 0.20, stance: 'Airspace closure window reserved' }
    ],
    resolution: null
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
      rationale: "TEE multi-source sentiment synthesis detected unpriced consensus shift (+14.0% vs Polymarket orderbook). Optimal execution intent: BUY_YES.",
      tee_attestation: {
        is_tee_verified: true,
        hardware: "Intel TDX / NVIDIA H100 Confidential GPU",
        enclave_measurement: "sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0",
        attestation_quote_b64: "TURneE5UYzBNVGt6TXpndU5EZzJNREV3T1RFM05qRTFNVEV3TlRVek1UTXpPVFU9",
        attestation_hash: "0x9c82fa0184b23d91e0a4f5c2b7d903e18a4c2f8190d7e63b1a2c5e4f8d9b0a1c",
        model: "deepseek-ai/DeepSeek-V3-Confidential",
        timestamp: 1793613000,
        zero_knowledge_log_guarantee: "No user prompts or model states recorded to persistent storage."
      }
    }
  },
  {
    id: "pm-sol-300-eoy",
    title: "Will Solana (SOL) Reach $300 Before End of Year?",
    category: "Crypto Milestones",
    volume_usd: "$18,420,000",
    end_date: "2026-12-31",
    market_prob: 0.42,
    token_id_yes: "0x7b340e91d823a07f8a41c2e03f7a6e4b",
    token_id_no: "0x8c451f02e934b18a9b52d3f14a8b7f5c",
    evidence_sources: [
      { name: "Spot SOL ETF Net Weekly Inflows", weight: 0.40, stance: "Accelerating institutional allocation" },
      { name: "Total Supply Valuation Metric (6.5B cap)", weight: 0.35, stance: "Requires $195B market cap consolidation" },
      { name: "DEX Daily Volume & Fee Burn Pace", weight: 0.25, stance: "High organic fee burn sustaining momentum" }
    ],
    ai_analysis: {
      ai_true_prob: 0.34,
      alpha_divergence: -0.08,
      recommended_action: "BUY_NO",
      expected_roi_percent: 19.0,
      confidence_level: "High (88.4%)",
      rationale: "Solana 6.5B total supply requires $195B valuation for $300. Mathematical friction indicates short-term consolidation. Recommendation: BUY_NO.",
      tee_attestation: {
        is_tee_verified: true,
        hardware: "Intel TDX / NVIDIA H100 Confidential GPU",
        enclave_measurement: "sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0",
        attestation_quote_b64: "T1RFM05qRTFNVEV3TlRVek1UTXpPVFVtTURneE5UYzBNVGt6TXpndU5EZzJNREV3",
        attestation_hash: "0x4b7e1082c9f3d5a01824b6e71f9c0d2a83e5f1b4c90d8a2e1b7c3f5d9a0b4e2c",
        model: "deepseek-ai/DeepSeek-V3-Confidential",
        timestamp: 1793613000,
        zero_knowledge_log_guarantee: "No user prompts or model states recorded to persistent storage."
      }
    }
  },
  {
    id: "pm-deepseek-v4-bench",
    title: "Will DeepSeek-V4 Outperform Claude 3.7 / GPT-5 on SWE-Bench?",
    category: "AI Benchmarks",
    volume_usd: "$9,750,000",
    end_date: "2026-11-30",
    market_prob: 0.61,
    token_id_yes: "0x9d562a13f045c29b0c63e4a25b9c8a6d",
    token_id_no: "0x0e673b24a156d30c1d74f5b36c0d9b7e",
    evidence_sources: [
      { name: "Arxiv Preprints & MoE Architecture Leaks", weight: 0.50, stance: "Significant multi-token prediction improvements" },
      { name: "GitHub Open Source Commits", weight: 0.30, stance: "Active tensor parallelism optimizations" },
      { name: "NEAR AI Cloud Model Serving Benchmark", weight: 0.20, stance: "Sub-millisecond confidential inference speeds" }
    ],
    ai_analysis: {
      ai_true_prob: 0.72,
      alpha_divergence: 0.11,
      recommended_action: "BUY_YES",
      expected_roi_percent: 18.0,
      confidence_level: "High (92.5%)",
      rationale: "Hardware TEE synthesis on coding benchmarks suggests DeepSeek-V4 MoE efficiency leap. High conviction: BUY_YES.",
      tee_attestation: {
        is_tee_verified: true,
        hardware: "Intel TDX / NVIDIA H100 Confidential GPU",
        enclave_measurement: "sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0",
        attestation_quote_b64: "TURneE5UYzBNVGt6TXpndU5EZzJNREV3T1RFM05qRTFNVEV3TlRVek1UTXpPVFU9",
        attestation_hash: "0x8a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
        model: "deepseek-ai/DeepSeek-V3-Confidential",
        timestamp: 1793613000,
        zero_knowledge_log_guarantee: "No user prompts or model states recorded to persistent storage."
      }
    }
  }
];
