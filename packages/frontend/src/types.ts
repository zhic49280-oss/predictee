export type RequestStatus = 'PENDING' | 'RESOLVED' | 'CANCELLED';

export interface EvidenceSource {
  name: string;
  weight: number;
  stance: string;
}

export interface OracleResolutionData {
  requestId: string;
  outcome: string;            // e.g. "YES", "NO", "BUY_YES"
  confidenceBps: number;      // e.g. 9420 = 94.2%
  attestationHash: string;
  enclaveMeasurement: string;
  evidenceDigest: string;
  signerAddress?: string;
  activeSignerAddress?: string;
  signedText?: string;
  ecdsaSignature?: string;
  verificationMode?: string;
  resolver: string;
  resolvedAt: string;
  hardware: string;
  model: string;
  attestationQuoteB64: string;
  zeroKnowledgeGuarantee: string;
  rationale?: string;
  evidenceSources?: EvidenceSource[];
}

export interface OracleRequestItem {
  requestId: string;
  requester: string;
  query: string;
  category: string;
  bountyNear: number;
  bountyYocto: string;
  status: RequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  callbackContract?: string | null;
  callbackMethod?: string | null;
  evidenceSources: EvidenceSource[];
  resolution?: OracleResolutionData | null;
}

export interface EnclaveNodeItem {
  id: string;
  measurement: string;
  signingAddress?: string;
  label: string;
  hardware: string;
  model: string;
  active: boolean;
  registeredAt: string;
  totalResolutions: number;
  uptime: string;
  attestationType: string;
  isolationGuarantee: string;
}

export interface OracleStatsData {
  totalRequests: number;
  pendingCount: number;
  resolvedCount: number;
  cancelledCount: number;
  totalBountiesPaidNear: number;
  activeEnclavesCount: number;
}

export interface Market {
  id: string;
  title: string;
  category: string;
  volume_usd: string;
  end_date: string;
  market_prob: number;
  token_id_yes: string;
  token_id_no: string;
  evidence_sources: Array<{ name: string; weight: number; stance: string }>;
  ai_analysis?: {
    ai_true_prob: number;
    alpha_divergence: number;
    recommended_action: string;
    expected_roi_percent: number;
    confidence_level: string;
    rationale: string;
    tee_attestation: {
      is_tee_verified: boolean;
      verification_mode?: string;
      hardware: string;
      enclave_measurement: string;
      attested_signing_address?: string;
      signer_address?: string;
      signed_text?: string;
      ecdsa_signature?: string;
      attestation_quote_b64: string;
      attestation_hash: string;
      model: string;
      timestamp: number;
      zero_knowledge_log_guarantee: string;
    };
  };
}

export interface AccountOption {
  accountId: string;
  derivedPolygonAddress: string;
  nearBalance: string;
  label: string;
}
