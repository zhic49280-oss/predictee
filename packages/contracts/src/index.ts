import { NearBindgen, initialize, call, view, near, UnorderedMap, assert, NearPromise } from 'near-sdk-js';

export type RequestStatus = "PENDING" | "RESOLVED" | "CANCELLED";

export interface OracleRequest {
    requestId: string;
    requester: string;
    query: string;
    category: string;
    bountyYocto: string;
    storagePaidYocto: string;
    status: RequestStatus;
    createdAt: string;
    resolvedAt: string | null;
    callbackContract: string | null;
    callbackMethod: string | null;
    callbackGasTgas?: number;
}

export interface OracleResolution {
    requestId: string;
    outcome: string;            // "YES", "NO", or "INVALID"
    confidenceBps: number;      // 0..10000 (e.g. 9120 = 91.2%)
    attestationHash: string;    // Cryptographic quote / signature digest
    enclaveMeasurement: string; // Real TDX MRTD / RTMR0 / Compose SHA-256
    evidenceDigest: string;     // SHA-256 digest of input context / request_sha256
    signerAddress: string;      // Verified ECDSA TEE signing_address (0x...)
    ecdsaSignature: string;     // 65-byte EIP-191 signature from TEE
    resolver: string;           // NEAR account of the TEE relayer / resolver
    resolvedAt: string;
}

export interface EnclaveInfo {
    measurement: string;
    signingAddress: string;     // Attested NEAR AI Cloud TEE ECDSA address (0x...)
    label: string;
    active: boolean;
    registeredAt: string;
}

export interface OracleStats {
    totalRequests: number;
    pendingCount: number;
    resolvedCount: number;
    cancelledCount: number;
    totalBountiesPaidYocto: string;
    activeEnclavesCount: number;
}

export interface BettingIntent {
    intentId: string;
    nearAccountId: string;
    marketId: string;
    side: string;
    amountYocto: string;
    attestationHash: string;
    status: string;
    timestamp: string;
}

const MAX_QUERY_LEN = 1000;
const MAX_CATEGORY_LEN = 64;
const MIN_DEPOSIT_YOCTO = BigInt("10000000000000000000000"); // 0.01 NEAR minimum
const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
        out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
    }
    return out;
}

function fromHex(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
    assert(clean.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(clean), "Invalid hex string");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
}

function utf8(s: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff) {
                c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
                i++;
            }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return new Uint8Array(out);
}

/**
 * Recovers the Ethereum-style `0x...` address from an EIP-191 personal_sign signature
 * using NEAR's native `keccak256` and `ecrecover` host precompiles.
 */
export function recoverEip191Address(text: string, signatureHex: string): string {
    const sig = fromHex(signatureHex);
    assert(sig.length === 65, "Invalid TEE ECDSA signature: must be 65 bytes (r || s || v)");
    let v = sig[64];
    if (v >= 27) v -= 27;
    assert(v === 0 || v === 1, "Invalid TEE ECDSA signature recovery id (v)");

    const textBytes = utf8(text);
    const prefix = utf8(`\x19Ethereum Signed Message:\n${textBytes.length}`);
    const msg = new Uint8Array(prefix.length + textBytes.length);
    msg.set(prefix, 0);
    msg.set(textBytes, prefix.length);
    const digest = near.keccak256(msg);

    const pubkey = near.ecrecover(digest, sig.slice(0, 64), v, 0);
    assert(pubkey !== null && pubkey.length === 64, "Invalid TEE ECDSA signature: ecrecover failed");
    const addrHash = near.keccak256(pubkey);
    return "0x" + toHex(addrHash.slice(12));
}

// Real hardware measurements & TEE signing addresses queried from https://cloud-api.near.ai/v1/attestation/report
export const INTEL_TDX_MRTD =
    "tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b";
export const NVIDIA_H100_RTMR0 =
    "tdx-rtmr0:bc122d143ab768565ba5c3774ff5f03a63c89a4df7c1f5ea38d3bd173409d14f8cbdcc36d40e703cccb996a9d9687590";
export const DSTACK_COMPOSE_HASH =
    "sha256:617be5914d178c435050db0af275a67317fcf3e6c0fa94c4b433e2c58e8e93fe";

@NearBindgen({ requireInit: true })
export class PredicTEEContract {
    ownerId: string = '';
    requestNonce: number = 0;
    resolvedCount: number = 0;
    cancelledCount: number = 0;
    totalBountiesPaidYocto: string = '0';

    requests = new UnorderedMap<OracleRequest>('req');
    resolutions = new UnorderedMap<OracleResolution>('res');
    verifiedEnclaves = new UnorderedMap<EnclaveInfo>('enc');
    authorizedResolvers = new UnorderedMap<boolean>('aut');
    usedSignatures = new UnorderedMap<boolean>('sig');
    intents = new UnorderedMap<BettingIntent>('int');

    @initialize({})
    init({ owner_id }: { owner_id?: string } = {}) {
        this.ownerId = owner_id || near.predecessorAccountId();
        this.requestNonce = 0;
        this.resolvedCount = 0;
        this.cancelledCount = 0;
        this.totalBountiesPaidYocto = '0';

        const now = near.blockTimestamp().toString();

        // Register real NEAR AI Cloud Intel TDX / NVIDIA H100 / Dstack measurements & TEE signing addresses
        // Verified against https://cloud-api.near.ai/v1/attestation/report (Intel DCAP + NVIDIA NRAS)
        this.verifiedEnclaves.set(INTEL_TDX_MRTD, {
            measurement: INTEL_TDX_MRTD,
            signingAddress: "0x3b753b4406613c5e70ae640508632b600424fa0c",
            label: "NEAR AI Cloud Intel TDX Enclave TD10 (z-ai/glm-5.3-flash TEE)",
            active: true,
            registeredAt: now
        });

        this.verifiedEnclaves.set(NVIDIA_H100_RTMR0, {
            measurement: NVIDIA_H100_RTMR0,
            signingAddress: "0x835ab53d20294ef795906dff21ae4c045336aa26",
            label: "NEAR AI Cloud TDX RTMR0 + NVIDIA H100 NRAS Enclave (Qwen/Qwen3.8-27B TEE)",
            active: true,
            registeredAt: now
        });

        this.verifiedEnclaves.set(DSTACK_COMPOSE_HASH, {
            measurement: DSTACK_COMPOSE_HASH,
            signingAddress: "0xb98a789cdc4817275f5155593ba73ef2a957e779",
            label: "NEAR AI Cloud Phala / Dstack Compose-Manager Gateway TEE",
            active: true,
            registeredAt: now
        });

        near.log(`[PredicTEE] Contract initialized. Owner: ${this.ownerId}`);
    }

    /**
     * Submit an on-chain prediction / resolution query to the PredicTEE network.
     * Validates deposit, query bounds, and storage staking before mutating state.
     */
    @call({ payableFunction: true })
    request_resolution({
        query,
        category = 'General',
        callback_contract,
        callback_method,
        callback_gas_tgas = 30
    }: {
        query: string;
        category?: string;
        callback_contract?: string;
        callback_method?: string;
        callback_gas_tgas?: number;
    }): string {
        const deposit = near.attachedDeposit();
        assert(deposit >= MIN_DEPOSIT_YOCTO, "Resolution request requires at least 0.01 NEAR bounty deposit (yoctoNEAR)");
        assert(Boolean(query && query.trim().length > 0), "Resolution query prompt cannot be empty");
        const cleanQuery = query.trim();
        const cleanCategory = (category || 'General').trim() || 'General';
        assert(cleanQuery.length <= MAX_QUERY_LEN, `Query exceeds maximum length of ${MAX_QUERY_LEN} characters`);
        assert(cleanCategory.length <= MAX_CATEGORY_LEN, `Category exceeds maximum length of ${MAX_CATEGORY_LEN} characters`);
        assert(
            (!callback_contract && !callback_method) || (Boolean(callback_contract) && Boolean(callback_method)),
            "callback_contract and callback_method must be provided together"
        );
        const safeCallbackGasTgas = Math.min(Math.max(10, Number(callback_gas_tgas || 30)), 150);

        const requester = near.predecessorAccountId();
        const storageBefore = near.storageUsage();
        this.requestNonce += 1;
        const requestId = `req-${this.requestNonce}`;

        const request: OracleRequest = {
            requestId,
            requester,
            query: cleanQuery,
            category: cleanCategory,
            bountyYocto: deposit.toString(),
            storagePaidYocto: '0',
            status: "PENDING",
            createdAt: near.blockTimestamp().toString(),
            resolvedAt: null,
            callbackContract: callback_contract || null,
            callbackMethod: callback_method || null,
            callbackGasTgas: safeCallbackGasTgas
        };

        this.requests.set(requestId, request);
        const storageUsed = near.storageUsage() > storageBefore ? near.storageUsage() - storageBefore : 0n;
        const storageCost = storageUsed * near.storageByteCost();
        request.storagePaidYocto = storageCost.toString();
        this.requests.set(requestId, request);

        const eventData = {
            standard: "predictee_oracle",
            version: "2.0.0",
            event: "oracle_request_created",
            data: [{
                request_id: requestId,
                requester,
                query: request.query,
                category: request.category,
                bounty_yocto: request.bountyYocto,
                storage_paid_yocto: request.storagePaidYocto,
                created_at: request.createdAt
            }]
        };
        near.log(`EVENT_JSON:${JSON.stringify(eventData)}`);

        return requestId;
    }

    /**
     * Build canonical message signed by a TEE enclave for a resolution fulfillment.
     * Binds request_id, outcome, confidence_bps, resolver account (anti-MEV front-running),
     * attestation_hash, enclave_measurement, and evidence_digest.
     */
    @view({})
    build_fulfill_message({
        request_id,
        outcome,
        confidence_bps,
        resolver = '',
        attestation_hash,
        enclave_measurement,
        evidence_digest = ''
    }: {
        request_id: string;
        outcome: string;
        confidence_bps: number;
        resolver?: string;
        attestation_hash: string;
        enclave_measurement: string;
        evidence_digest?: string;
    }): string {
        const cleanDigest = (evidence_digest || '').trim().replace(/^0x/i, '').toLowerCase();
        const cleanResolver = (resolver || '').trim();
        return `PREDICTEE_RESOLVE_V3:${request_id}:${outcome.trim()}:${confidence_bps}:${cleanResolver}:${attestation_hash.trim()}:${enclave_measurement}:${cleanDigest}`;
    }

    /**
     * Fulfill an active prediction request from an attested NEAR AI Cloud TEE Enclave.
     *
     * Supports two cryptographic verification paths via on-chain `near.ecrecover`:
     *   - Mode A (Native NEAR AI Cloud `/v1/signature/{chat_id}` verification):
     *     When `request_body` and `response_body` are supplied, the contract computes
     *     `sha256(request_body)` and `sha256(response_body)` on-chain, verifies that
     *     `signed_text` equals `${req_sha256}:${resp_sha256}` (or `${model}:${req_sha256}:${resp_sha256}`),
     *     verifies `request_body` contains `request.query` and `response_body` contains
     *     `outcome` and `confidence_bps`, and verifies `near.ecrecover` against `enclave.signingAddress`.
     *   - Mode B (Canonical `PREDICTEE_RESOLVE_V3` verification):
     *     Verifies `near.ecrecover` over the canonical `PREDICTEE_RESOLVE_V3` message binding
     *     `request_id`, `outcome`, `confidence_bps`, and `resolver` (anti-MEV front-running).
     */
    @call({})
    fulfill_resolution({
        request_id,
        outcome,
        confidence_bps,
        attestation_hash,
        enclave_measurement,
        evidence_digest = '',
        signed_text = '',
        ecdsa_signature = '',
        request_body = '',
        response_body = ''
    }: {
        request_id: string;
        outcome: string;
        confidence_bps: number;
        attestation_hash: string;
        enclave_measurement: string;
        evidence_digest?: string;
        signed_text?: string;
        ecdsa_signature?: string;
        request_body?: string;
        response_body?: string;
    }): OracleResolution {
        // 1. Verify TEE Hardware Enclave measurement against on-chain whitelist
        const enclave = this.verifiedEnclaves.get(enclave_measurement);
        if (!enclave || !enclave.active) {
            throw new Error("Unverified TEE Hardware: Enclave measurement rejected.");
        }

        // 2. Validate request exists, is PENDING, and parameters are strictly well-formed
        const request = this.requests.get(request_id);
        assert(request !== null, `OracleRequest not found: ${request_id}`);
        assert(request.status === "PENDING", `Request ${request_id} is not in PENDING state (status: ${request.status})`);
        assert(
            typeof confidence_bps === "number" && Number.isInteger(confidence_bps) && confidence_bps >= 0 && confidence_bps <= 10000,
            "confidence_bps must be an integer between 0 and 10000"
        );
        assert(Boolean(outcome && outcome.trim().length > 0), "Outcome string cannot be empty");
        const cleanOutcome = outcome.trim().toUpperCase();
        assert(
            cleanOutcome === "YES" || cleanOutcome === "NO" || cleanOutcome === "INVALID",
            "Outcome must be one of YES, NO, or INVALID"
        );
        assert(Boolean(attestation_hash && attestation_hash.trim().length > 0), "Attestation hash is required");

        const resolver = near.predecessorAccountId();
        let verifiedSignerAddress = enclave.signingAddress;

        // 3. Cryptographic TEE ECDSA verification OR Authorized Resolver check
        if (ecdsa_signature && ecdsa_signature.trim().length > 0) {
            const canonicalMsg = this.build_fulfill_message({
                request_id,
                outcome: cleanOutcome,
                confidence_bps,
                resolver,
                attestation_hash,
                enclave_measurement,
                evidence_digest
            });

            let msgToVerify = canonicalMsg;

            if (request_body && request_body.length > 0 && response_body && response_body.length > 0) {
                // Mode A: Native NEAR AI Cloud /v1/signature/{chat_id} verification
                const reqSha256 = toHex(near.sha256(utf8(request_body)));
                const respSha256 = toHex(near.sha256(utf8(response_body)));
                const expectedPair = `${reqSha256}:${respSha256}`;
                const cleanSignedText = signed_text.trim();
                assert(
                    cleanSignedText === expectedPair || cleanSignedText.endsWith(`:${expectedPair}`),
                    `Invalid NEAR AI Cloud signed_text: expected [model:]${expectedPair}, got ${cleanSignedText}`
                );
                assert(
                    request_body.includes(request.query),
                    "Invalid request_body: does not contain the on-chain OracleRequest query"
                );
                assert(
                    (response_body.includes(`"${cleanOutcome}"`) || response_body.includes(`\\"${cleanOutcome}\\"`))
                    && response_body.includes(String(confidence_bps)),
                    "Invalid response_body: does not match submitted outcome and confidence_bps"
                );
                msgToVerify = cleanSignedText;
            } else {
                // Mode B: Canonical PREDICTEE_RESOLVE_V3 verification (SEC-01 & SEC-02)
                if (signed_text && signed_text.trim().length > 0) {
                    assert(
                        signed_text.trim() === canonicalMsg,
                        "Invalid signed_text: must match canonical PREDICTEE_RESOLVE_V3 message binding request_id, outcome, confidence_bps, and resolver"
                    );
                }
            }

            // Key replay protection by message digest to prevent ECDSA (r, n-s) malleability bypass
            const msgDigestKey = toHex(near.keccak256(utf8(msgToVerify)));
            assert(
                !this.usedSignatures.get(msgDigestKey),
                "TEE ECDSA signature replay rejected: message digest has already been used"
            );

            const recovered = recoverEip191Address(msgToVerify, ecdsa_signature.trim());
            assert(
                recovered.toLowerCase() === enclave.signingAddress.toLowerCase(),
                `Invalid TEE ECDSA Signature: recovered ${recovered} does not match enclave signingAddress ${enclave.signingAddress}`
            );
            this.usedSignatures.set(msgDigestKey, true);
            verifiedSignerAddress = recovered.toLowerCase();
        } else {
            const isAuthorized = Boolean(this.authorizedResolvers.get(resolver));
            assert(
                isAuthorized,
                `Unauthorized Resolver: ${resolver} must provide a valid TEE ECDSA signature or be an authorized TEE relayer`
            );
        }

        const resolvedAt = near.blockTimestamp().toString();

        // 4. Update request status to RESOLVED
        request.status = "RESOLVED";
        request.resolvedAt = resolvedAt;
        this.requests.set(request_id, request);

        // 5. Create and store OracleResolution
        const resolution: OracleResolution = {
            requestId: request_id,
            outcome: cleanOutcome,
            confidenceBps: confidence_bps,
            attestationHash: attestation_hash.trim(),
            enclaveMeasurement: enclave_measurement,
            evidenceDigest: evidence_digest || '',
            signerAddress: verifiedSignerAddress,
            ecdsaSignature: ecdsa_signature ? ecdsa_signature.trim() : '',
            resolver,
            resolvedAt
        };
        this.resolutions.set(request_id, resolution);

        // 6. Update Oracle statistics and compute net bounty after retaining storage staking cost
        this.resolvedCount += 1;
        const bountyYocto = BigInt(request.bountyYocto);
        const storagePaidYocto = BigInt(request.storagePaidYocto || '0');
        const netBountyYocto = bountyYocto > storagePaidYocto ? bountyYocto - storagePaidYocto : 0n;
        this.totalBountiesPaidYocto = (BigInt(this.totalBountiesPaidYocto) + netBountyYocto).toString();

        // 7. Transfer net bounty reward to the TEE resolver
        if (netBountyYocto > 0n) {
            NearPromise.new(resolver).transfer(netBountyYocto).build();
        }

        // 8. Dispatch callback to consumer contract if registered (REL-02: configurable gas default 30 TGas)
        if (request.callbackContract && request.callbackMethod) {
            const callbackPayload = JSON.stringify({
                requestId: request_id,
                outcome: resolution.outcome,
                confidenceBps: resolution.confidenceBps,
                attestationHash: resolution.attestationHash,
                signerAddress: resolution.signerAddress,
                evidenceDigest: resolution.evidenceDigest
            });
            const callbackGas = BigInt(request.callbackGasTgas || 30) * BigInt("1000000000000");
            NearPromise.new(request.callbackContract).functionCall(
                request.callbackMethod,
                callbackPayload,
                0n,
                callbackGas
            ).build();
        }

        // 9. Emit standard NEP-297 fulfilled event
        const eventData = {
            standard: "predictee_oracle",
            version: "2.0.0",
            event: "oracle_request_fulfilled",
            data: [{
                request_id,
                outcome: resolution.outcome,
                confidence_bps,
                resolver,
                signer_address: verifiedSignerAddress,
                attestation_hash,
                enclave_measurement,
                bounty_paid_yocto: netBountyYocto.toString(),
                storage_retained_yocto: storagePaidYocto.toString(),
                resolved_at: resolvedAt
            }]
        };
        near.log(`EVENT_JSON:${JSON.stringify(eventData)}`);

        return resolution;
    }

    /**
     * Cancel a pending request and refund the net bounty deposit (after deducting storage staking cost) to the requester.
     * Can only be called by the original requester or contract owner.
     */
    @call({})
    cancel_request({ request_id }: { request_id: string }): boolean {
        const caller = near.predecessorAccountId();
        const request = this.requests.get(request_id);
        assert(request !== null, `OracleRequest not found: ${request_id}`);
        assert(request.status === "PENDING", `Cannot cancel request with status ${request.status}`);
        assert(
            caller === request.requester || caller === this.ownerId,
            "Only requester or contract owner can cancel the request"
        );

        const cancelledAt = near.blockTimestamp().toString();
        request.status = "CANCELLED";
        request.resolvedAt = cancelledAt;
        this.requests.set(request_id, request);

        this.cancelledCount += 1;
        // SEC-05 fix: Deduct storagePaidYocto from refund to prevent storage staking drainage DoS
        const bountyYocto = BigInt(request.bountyYocto);
        const storagePaidYocto = BigInt(request.storagePaidYocto || '0');
        const refundYocto = bountyYocto > storagePaidYocto ? bountyYocto - storagePaidYocto : 0n;
        if (refundYocto > 0n) {
            NearPromise.new(request.requester).transfer(refundYocto).build();
        }

        const eventData = {
            standard: "predictee_oracle",
            version: "2.0.0",
            event: "oracle_request_cancelled",
            data: [{
                request_id,
                requester: request.requester,
                refunded_yocto: refundYocto.toString(),
                storage_retained_yocto: storagePaidYocto.toString(),
                cancelled_at: cancelledAt
            }]
        };
        near.log(`EVENT_JSON:${JSON.stringify(eventData)}`);
        return true;
    }

    /**
     * Register or update a verified TEE Hardware measurement & ECDSA signing address (Owner only).
     */
    @call({})
    register_tee_enclave({
        measurement,
        signing_address = "0x3b753b4406613c5e70ae640508632b600424fa0c",
        label = "NEAR AI Cloud Confidential Enclave"
    }: {
        measurement: string;
        signing_address?: string;
        label?: string;
    }): boolean {
        assert(near.predecessorAccountId() === this.ownerId, "Only contract owner can register TEE enclave");
        assert(Boolean(measurement && measurement.trim().length > 0), "Enclave measurement cannot be empty");
        const cleanAddr = signing_address.trim().toLowerCase();
        assert(/^0x[0-9a-f]{40}$/.test(cleanAddr), "signing_address must be a valid 20-byte 0x hex address");

        const enclaveInfo: EnclaveInfo = {
            measurement: measurement.trim(),
            signingAddress: cleanAddr,
            label: label.trim(),
            active: true,
            registeredAt: near.blockTimestamp().toString()
        };

        this.verifiedEnclaves.set(enclaveInfo.measurement, enclaveInfo);
        near.log(`[PredicTEE] Enclave registered: ${enclaveInfo.measurement} (signer: ${enclaveInfo.signingAddress})`);
        return true;
    }

    /**
     * Deactivate a TEE Hardware measurement to revoke fulfill permissions (Owner only).
     */
    @call({})
    deactivate_tee_enclave({ measurement }: { measurement: string }): boolean {
        assert(near.predecessorAccountId() === this.ownerId, "Only contract owner can deactivate TEE enclave");
        const enclave = this.verifiedEnclaves.get(measurement);
        assert(enclave !== null, `Enclave measurement not found: ${measurement}`);

        enclave.active = false;
        this.verifiedEnclaves.set(measurement, enclave);
        near.log(`[PredicTEE] Enclave deactivated: ${measurement}`);
        return true;
    }

    /**
     * Authorize or revoke a NEAR account as a relayer for keyless/fallback resolution (Owner only).
     */
    @call({})
    set_authorized_resolver({ account_id, authorized = true }: { account_id: string; authorized?: boolean }): boolean {
        assert(near.predecessorAccountId() === this.ownerId, "Only contract owner can configure authorized resolvers");
        assert(Boolean(account_id && account_id.trim().length > 0), "account_id cannot be empty");
        this.authorizedResolvers.set(account_id.trim(), Boolean(authorized));
        return true;
    }

    @call({})
    transfer_ownership({ new_owner_id }: { new_owner_id: string }): boolean {
        assert(near.predecessorAccountId() === this.ownerId, "Only contract owner can transfer ownership");
        assert(Boolean(new_owner_id && new_owner_id.trim().length > 0), "new_owner_id cannot be empty");
        this.ownerId = new_owner_id.trim();
        return true;
    }

    // ==========================================
    // View Methods
    // ==========================================

    @view({})
    get_request({ request_id }: { request_id: string }): OracleRequest | null {
        return this.requests.get(request_id) || null;
    }

    @view({})
    get_resolution({ request_id }: { request_id: string }): OracleResolution | null {
        return this.resolutions.get(request_id) || null;
    }

    /**
     * Gas-safe bounded pagination over requests (`req-1` .. `req-N`).
     */
    @view({})
    list_requests({
        from_index = 0,
        limit = 50,
        status
    }: {
        from_index?: number;
        limit?: number;
        status?: RequestStatus;
    }): OracleRequest[] {
        const total = this.requestNonce;
        if (total === 0 || from_index >= total) {
            return [];
        }

        const effectiveLimit = Math.min(Math.max(1, limit), 100);
        const results: OracleRequest[] = [];
        const maxScan = Math.min(total, from_index + 1000);

        for (let i = from_index + 1; i <= maxScan; i++) {
            const req = this.requests.get(`req-${i}`);
            if (req && (!status || req.status === status)) {
                results.push(req);
                if (results.length >= effectiveLimit) {
                    break;
                }
            }
        }
        return results;
    }

    @view({})
    get_stats(): OracleStats {
        let activeCount = 0;
        const total = Math.min(this.verifiedEnclaves.length, 100);
        const enclaveKeys = this.verifiedEnclaves.keys({ start: 0, limit: total });
        for (const key of enclaveKeys) {
            const enc = this.verifiedEnclaves.get(key);
            if (enc && enc.active) {
                activeCount += 1;
            }
        }

        const totalReq = this.requestNonce;
        const resolved = this.resolvedCount;
        const cancelled = this.cancelledCount;
        const pending = Math.max(0, totalReq - resolved - cancelled);

        return {
            totalRequests: totalReq,
            pendingCount: pending,
            resolvedCount: resolved,
            cancelledCount: cancelled,
            totalBountiesPaidYocto: this.totalBountiesPaidYocto,
            activeEnclavesCount: activeCount
        };
    }

    @view({})
    is_enclave_verified({ measurement }: { measurement: string }): boolean {
        const enclave = this.verifiedEnclaves.get(measurement);
        return Boolean(enclave && enclave.active);
    }

    @view({})
    get_enclave_info({ measurement }: { measurement: string }): EnclaveInfo | null {
        return this.verifiedEnclaves.get(measurement) || null;
    }

    @view({})
    list_enclaves(): EnclaveInfo[] {
        const total = Math.min(this.verifiedEnclaves.length, 100);
        const keys = this.verifiedEnclaves.keys({ start: 0, limit: total });
        const list: EnclaveInfo[] = [];
        for (const key of keys) {
            const enc = this.verifiedEnclaves.get(key);
            if (enc) {
                list.push(enc);
            }
        }
        return list;
    }

    // ==========================================
    // Cross-Chain Betting Intent Registry Methods
    // ==========================================

    @call({ payableFunction: true })
    register_intent({
        intentId,
        marketId,
        side,
        attestationHash,
        enclaveMeasurement
    }: {
        intentId: string;
        marketId: string;
        side: string;
        attestationHash: string;
        enclaveMeasurement: string;
    }): boolean {
        const isVerifiedEnclave = this.is_enclave_verified({ measurement: enclaveMeasurement });
        if (!isVerifiedEnclave) {
            throw new Error("Unverified TEE Hardware: Enclave measurement rejected.");
        }
        assert(Boolean(intentId && intentId.trim().length > 0), "intentId cannot be empty");
        assert(this.intents.get(intentId) === null, `Intent already exists: ${intentId}`);

        const sender = near.predecessorAccountId();
        const intent: BettingIntent = {
            intentId,
            nearAccountId: sender,
            marketId,
            side,
            amountYocto: near.attachedDeposit().toString(),
            attestationHash,
            status: "COMMITTED",
            timestamp: near.blockTimestamp().toString()
        };

        this.intents.set(intentId, intent);
        near.log(`[PredicTEE] Intent registered: ${intentId} by ${sender} with TEE proof ${attestationHash}`);
        return true;
    }

    /**
     * Allows the intent creator or contract owner to cancel a COMMITTED intent and refund attached NEAR.
     */
    @call({})
    cancel_intent({ intentId }: { intentId: string }): boolean {
        const caller = near.predecessorAccountId();
        const intent = this.intents.get(intentId);
        assert(intent !== null, `Intent not found: ${intentId}`);
        assert(intent.status === "COMMITTED", `Intent cannot be cancelled in status: ${intent.status}`);
        assert(caller === intent.nearAccountId || caller === this.ownerId, "Only intent creator or owner can cancel intent");

        intent.status = "CANCELLED";
        this.intents.set(intentId, intent);

        const refund = BigInt(intent.amountYocto);
        if (refund > 0n) {
            NearPromise.new(intent.nearAccountId).transfer(refund).build();
        }
        return true;
    }

    @view({})
    get_intent({ intentId }: { intentId: string }): BettingIntent | null {
        return this.intents.get(intentId) || null;
    }
}
