/**
 * PredicTEE Contract Verification & Simulation Suite
 * Demonstrates:
 * 1. Contract Initialization with Real NEAR AI Cloud TEE Measurements & Signers
 * 2. On-Chain TEE Enclave Hardware Whitelist, Signer Address & Access Control
 * 3. Oracle Request Creation with Deposit Validation & Storage Staking
 * 4. Cryptographic EIP-191 ECDSA (`near.ecrecover`) & Anti-Spoofing Enforcement
 * 5. Legitimate TEE Fulfillment, State Transitions, Callback & Resolver Bounty Payout
 * 6. Request Cancellation & Bounty Refund
 * 7. Gas-Safe Bounded Pagination, Filter Queries, and Global Stats
 * 8. Cross-Chain Intent Registry & Refundable Intent Cancellation
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractDir = path.resolve(__dirname, '..');

// 1. Ensure bundle exists
const bundlePath = path.join(contractDir, 'build', 'bundle.cjs');
console.log('🔄 Compiling / bundling contract for simulation...');
execSync(`npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=build/bundle.cjs`, {
    cwd: contractDir,
    stdio: 'ignore'
});
console.log('✅ Contract bundled successfully.\n');

// 2. Setup mock NEAR Runtime Environment with REAL sha256, keccak256 & ecrecover
const storage = new Map();
const registers = new Map();
const loggedEvents = [];
const transfers = [];

let currentSender = 'oracle.predictee.near';
let currentDeposit = 0n;
let currentTimestamp = 1793678400000000000n; // Nov 2026

const sha256Bytes = (b) => new Uint8Array(createHash('sha256').update(Buffer.from(b)).digest());

globalThis.env = {
    latin1_string_to_uint8array: (s) => Buffer.from(s, 'latin1'),
    uint8array_to_latin1_string: (b) => Buffer.from(b).toString('latin1'),
    utf8_string_to_uint8array: (s) => Buffer.from(s, 'utf8'),
    uint8array_to_utf8_string: (b) => Buffer.from(b).toString('utf8'),
    log: (...args) => {
        const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        loggedEvents.push(line);
    },
    read_register: (reg) => registers.get(reg) || new Uint8Array(),
    predecessor_account_id: (reg) => {
        registers.set(reg, Buffer.from(currentSender, 'latin1'));
    },
    current_account_id: (reg) => {
        registers.set(reg, Buffer.from('oracle.predictee.near', 'latin1'));
    },
    signer_account_id: (reg) => {
        registers.set(reg, Buffer.from(currentSender, 'latin1'));
    },
    block_timestamp: () => currentTimestamp,
    attached_deposit: () => currentDeposit,
    storage_usage: () => {
        let total = 2000n;
        for (const [k, v] of storage) {
            total += BigInt(Buffer.byteLength(k, 'latin1') + v.length + 40);
        }
        return total;
    },
    storage_write: (key, value, reg) => {
        const kStr = Buffer.from(key).toString('latin1');
        const vBuf = Buffer.from(value);
        const existed = storage.has(kStr);
        if (existed && reg !== undefined) {
            registers.set(reg, storage.get(kStr));
        }
        storage.set(kStr, vBuf);
        return existed ? 1n : 0n;
    },
    storage_read: (key, reg) => {
        const kStr = Buffer.from(key).toString('latin1');
        if (storage.has(kStr)) {
            registers.set(reg, storage.get(kStr));
            return 1n;
        }
        return 0n;
    },
    storage_has_key: (key) => {
        const kStr = Buffer.from(key).toString('latin1');
        return storage.has(kStr) ? 1n : 0n;
    },
    storage_remove: (key, reg) => {
        const kStr = Buffer.from(key).toString('latin1');
        if (storage.has(kStr)) {
            registers.set(reg, storage.get(kStr));
            storage.delete(kStr);
            return 1n;
        }
        return 0n;
    },
    panic_utf8: (msg) => {
        const m = Buffer.from(msg).toString('utf8');
        throw new Error('Panic: ' + m);
    },
    sha256: (value, reg) => {
        registers.set(reg, sha256Bytes(value));
    },
    keccak256: (value, reg) => {
        registers.set(reg, keccak_256(new Uint8Array(value)));
    },
    ecrecover: (hash, sig, v, _malleability, reg) => {
        try {
            const recovered = new Uint8Array(65);
            recovered[0] = Number(v);
            recovered.set(new Uint8Array(sig), 1);
            const compressed = secp256k1.recoverPublicKey(recovered, new Uint8Array(hash), { prehash: false });
            const uncompressed = secp256k1.Point.fromBytes(compressed).toBytes(false);
            registers.set(reg, uncompressed.slice(1));
            return 1n;
        } catch {
            return 0n;
        }
    },
    promise_batch_create: (accountId) => {
        const acc = Buffer.from(accountId).toString('utf8');
        const id = transfers.length;
        transfers.push({ account: acc, amount: 0n, type: 'TRANSFER' });
        return BigInt(id);
    },
    promise_batch_action_transfer: (idx, amount) => {
        if (transfers[Number(idx)]) {
            transfers[Number(idx)].amount = amount;
        }
    },
    promise_batch_action_function_call: (idx, fn, args, deposit, gas) => {
        transfers.push({
            account: 'callback',
            functionName: Buffer.from(fn).toString('utf8'),
            args: Buffer.from(args).toString('utf8'),
            type: 'CROSS_CONTRACT_CALL'
        });
    },
    promise_return: () => {}
};

function setContext(sender, depositYocto = 0n, timestampNanos = currentTimestamp) {
    currentSender = sender;
    currentDeposit = depositYocto;
    currentTimestamp = timestampNanos;
}

function expectThrow(fn, expectedSubstr, testName) {
    try {
        fn();
        console.error(`❌ [FAIL] ${testName}: Expected exception containing "${expectedSubstr}", but no error was thrown.`);
        process.exit(1);
    } catch (err) {
        if (expectedSubstr && !err.message.includes(expectedSubstr)) {
            console.error(`❌ [FAIL] ${testName}: Expected "${expectedSubstr}", got "${err.message}"`);
            process.exit(1);
        }
        console.log(`  ✓ [ASSERTED] Rejected as expected: "${err.message.split('\n')[0]}"`);
    }
}

function generateTestEnclaveKeypair() {
    const { secretKey, publicKey } = secp256k1.keygen();
    const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false).slice(1);
    const address = '0x' + Buffer.from(keccak_256(uncompressed).slice(12)).toString('hex');
    return { secretKey, address };
}

function signEip191(text, secretKey) {
    const body = Buffer.from(text, 'utf8');
    const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${body.length}`, 'utf8');
    const digest = keccak_256(Buffer.concat([prefix, body]));
    const sig = secp256k1.sign(digest, secretKey, { prehash: false, format: 'recovered' });
    const out = Buffer.alloc(65);
    Buffer.from(sig.slice(1)).copy(out, 0);
    out[64] = 27 + sig[0];
    return '0x' + out.toString('hex');
}

async function runSimulation() {
    console.log('========================================================================');
    console.log('           PREDICTEE NEAR SMART CONTRACT SIMULATION TEST SUITE          ');
    console.log('========================================================================\n');

    const contractModule = require(bundlePath);
    const { PredicTEEContract, INTEL_TDX_MRTD, NVIDIA_H100_RTMR0, DSTACK_COMPOSE_HASH } = contractModule;
    const contract = new PredicTEEContract();

    // -------------------------------------------------------------
    // Test 1: Initialization
    // -------------------------------------------------------------
    console.log('--- TEST 1: Contract Initialization ---');
    setContext('deployer.near', 0n);
    contract.init({ owner_id: 'oracle.predictee.near' });
    console.log('Contract owner:', contract.ownerId);

    const initialEnclaves = contract.list_enclaves();
    console.log(`Registered default verified enclaves: ${initialEnclaves.length}`);
    initialEnclaves.forEach(e => console.log(`  - [${e.active ? 'ACTIVE' : 'DISABLED'}] ${e.label} (${e.measurement.slice(0, 32)}... | signer: ${e.signingAddress})`));

    if (!contract.is_enclave_verified({ measurement: INTEL_TDX_MRTD })) {
        throw new Error('Default Intel TDX MRTD measurement must be verified');
    }
    if (!contract.is_enclave_verified({ measurement: NVIDIA_H100_RTMR0 })) {
        throw new Error('Default NVIDIA H100 RTMR0 measurement must be verified');
    }
    if (!contract.is_enclave_verified({ measurement: DSTACK_COMPOSE_HASH })) {
        throw new Error('Default Dstack compose hash must be verified');
    }
    console.log('✅ Initialization verified.\n');

    // -------------------------------------------------------------
    // Test 2: Owner Administration & TEE Whitelist + Signer Updates
    // -------------------------------------------------------------
    console.log('--- TEST 2: Enclave Whitelist Management & Access Control ---');
    const teeKeypair = generateTestEnclaveKeypair();
    const rogueKeypair = generateTestEnclaveKeypair();
    const ATTESTED_ENCLAVE_MEASUREMENT = 'tdx-mrtd:' + 'a1b2c3d4'.repeat(12);

    // Non-owner registration attempt
    setContext('stranger.near', 0n);
    expectThrow(() => {
        contract.register_tee_enclave({
            measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            signing_address: teeKeypair.address,
            label: 'Unauthorized Rogue Enclave'
        });
    }, 'Only contract owner can register TEE enclave', 'Non-owner enclave registration');

    // Owner registers enclave with real secp256k1 signing address
    setContext('oracle.predictee.near', 0n);
    contract.register_tee_enclave({
        measurement: ATTESTED_ENCLAVE_MEASUREMENT,
        signing_address: teeKeypair.address,
        label: 'NEAR AI Cloud Attested Test Enclave'
    });
    if (!contract.is_enclave_verified({ measurement: ATTESTED_ENCLAVE_MEASUREMENT })) {
        throw new Error('Newly registered enclave should be verified');
    }
    console.log(`  ✓ Owner registered new TEE enclave with signer ${teeKeypair.address}`);

    // Temporary enclave deactivation test
    const TEMP_MEASUREMENT = 'sha256:' + '99'.repeat(32);
    contract.register_tee_enclave({
        measurement: TEMP_MEASUREMENT,
        signing_address: teeKeypair.address,
        label: 'Temporary Enclave'
    });
    contract.deactivate_tee_enclave({ measurement: TEMP_MEASUREMENT });
    if (contract.is_enclave_verified({ measurement: TEMP_MEASUREMENT })) {
        throw new Error('Deactivated enclave must not be verified');
    }
    console.log('  ✓ Owner deactivated temporary TEE enclave successfully\n');

    // -------------------------------------------------------------
    // Test 3: Oracle Request Creation & Deposit Validation
    // -------------------------------------------------------------
    console.log('--- TEST 3: Oracle Request Creation with Bounty & Storage Staking ---');
    setContext('alice.near', 0n);
    expectThrow(() => {
        contract.request_resolution({
            query: 'Will the Federal Reserve cut interest rates in Q4 2026?',
            category: 'Macro & Fed'
        });
    }, 'at least 0.01 NEAR bounty deposit', 'Zero deposit request');

    const twoNear = 2_000_000_000_000_000_000_000_000n;
    setContext('alice.near', twoNear);
    const req1Id = contract.request_resolution({
        query: 'Did DeepSeek-V4 achieve >80% on SWE-bench Verified?',
        category: 'AI Benchmarks',
        callback_contract: 'market.predictee.near',
        callback_method: 'on_oracle_resolved'
    });
    if (req1Id !== 'req-1') {
        throw new Error(`Expected req-1, got ${req1Id}`);
    }
    const req1 = contract.get_request({ request_id: 'req-1' });
    if (BigInt(req1.storagePaidYocto) <= 0n) {
        throw new Error('Expected positive storagePaidYocto accounting');
    }
    console.log(`  ✓ Created ${req1Id} (bounty: 2 NEAR, storage staked: ${req1.storagePaidYocto} yocto)`);

    const oneNear = 1_000_000_000_000_000_000_000_000n;
    setContext('bob.near', oneNear);
    const req2Id = contract.request_resolution({
        query: 'Will BTC exceed $150k before Dec 31, 2026?',
        category: 'Crypto'
    });
    console.log(`  ✓ Created ${req2Id} (bounty: 1 NEAR)\n`);

    // -------------------------------------------------------------
    // Test 4: Cryptographic ECDSA & Anti-Spoofing Enforcement
    // -------------------------------------------------------------
    console.log('--- TEST 4: TEE Cryptographic Signature & Measurement Enforcement ---');
    setContext('attacker.near', 0n);

    // 4a. Unknown measurement rejected
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'YES',
            confidence_bps: 9500,
            attestation_hash: '0xdeadbeef',
            enclave_measurement: 'sha256:00000000000000000000000000000000000000000000000000000000deadbeef'
        });
    }, 'Unverified TEE Hardware', 'Rogue measurement rejected');

    // 4b. Unauthenticated caller copying public measurement string from README WITHOUT signature rejected!
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'YES',
            confidence_bps: 9500,
            attestation_hash: '0xdeadbeef',
            enclave_measurement: INTEL_TDX_MRTD
        });
    }, 'Unauthorized Resolver', 'Public measurement spoofing without TEE signature rejected');

    // 4c. Forged ECDSA signature from rogue private key rejected by near.ecrecover!
    const canonicalMsg = contract.build_fulfill_message({
        request_id: 'req-1',
        outcome: 'YES',
        confidence_bps: 9250,
        resolver: 'relayer.predictee.near',
        attestation_hash: '0x7a9f82d1c6b3e401',
        enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
        evidence_digest: '0xfeedface'
    });
    const forgedSig = signEip191(canonicalMsg, rogueKeypair.secretKey);
    setContext('relayer.predictee.near', 0n);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'YES',
            confidence_bps: 9250,
            attestation_hash: '0x7a9f82d1c6b3e401',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            evidence_digest: '0xfeedface',
            signed_text: canonicalMsg,
            ecdsa_signature: forgedSig
        });
    }, 'Invalid TEE ECDSA Signature', 'Rogue ECDSA key rejected by on-chain ecrecover');

    // 4d. Tampered outcome after TEE signing rejected by on-chain ecrecover!
    const validSigForYes = signEip191(canonicalMsg, teeKeypair.secretKey);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'NO', // Tampered by relayer!
            confidence_bps: 9250,
            attestation_hash: '0x7a9f82d1c6b3e401',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            evidence_digest: '0xfeedface',
            ecdsa_signature: validSigForYes
        });
    }, 'Invalid TEE ECDSA Signature', 'Relayer outcome tampering rejected by on-chain ecrecover');

    // 4e. SEC-01 Guard: Decoupled signed_text (e.g. arbitrary chat hash) rejected!
    const decoupledText = 'z-ai/glm-5.3-flash:aaaa:bbbb';
    const decoupledSig = signEip191(decoupledText, teeKeypair.secretKey);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'NO',
            confidence_bps: 9900,
            attestation_hash: '0x7a9f82d1c6b3e401',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            evidence_digest: '',
            signed_text: decoupledText,
            ecdsa_signature: decoupledSig
        });
    }, 'Invalid signed_text: must match canonical PREDICTEE_RESOLVE_V3 message', 'SEC-01 decoupled signed_text rejected');

    // 4f. SEC-02 Guard: MEV Front-runner copying valid signature under attacker.near rejected!
    setContext('attacker.near', 0n);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-1',
            outcome: 'YES',
            confidence_bps: 9250,
            attestation_hash: '0x7a9f82d1c6b3e401',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            evidence_digest: '0xfeedface',
            ecdsa_signature: validSigForYes
        });
    }, 'Invalid TEE ECDSA Signature', 'SEC-02 MEV front-running bounty theft rejected');
    console.log('✅ All spoofing, tampering, decoupled-signature & MEV front-running vectors rejected on-chain.\n');

    // -------------------------------------------------------------
    // Test 5: Legitimate Cryptographic TEE Fulfillment & Bounty Payout
    // -------------------------------------------------------------
    console.log('--- TEST 5: Legitimate TEE Fulfillment, Ecrecover & Bounty Release ---');
    setContext('relayer.predictee.near', 0n);
    transfers.length = 0;

    const resolution = contract.fulfill_resolution({
        request_id: 'req-1',
        outcome: 'YES',
        confidence_bps: 9250,
        attestation_hash: '0x7a9f82d1c6b3e401',
        enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
        evidence_digest: '0xfeedface',
        signed_text: canonicalMsg,
        ecdsa_signature: validSigForYes
    });

    if (resolution.outcome !== 'YES' || resolution.confidenceBps !== 9250) {
        throw new Error('Resolution outcome mismatch');
    }
    if (resolution.signerAddress !== teeKeypair.address.toLowerCase()) {
        throw new Error(`Expected recovered signer ${teeKeypair.address}, got ${resolution.signerAddress}`);
    }
    const expectedNetBounty1 = twoNear - BigInt(req1.storagePaidYocto || '0');
    const payoutTx = transfers.find(t => t.type === 'TRANSFER' && t.account === 'relayer.predictee.near');
    if (!payoutTx || payoutTx.amount !== expectedNetBounty1) {
        throw new Error(`Expected net bounty transfer ${expectedNetBounty1} yoctoNEAR (after storage staking deduction) to relayer.predictee.near`);
    }
    const callbackTx = transfers.find(t => t.type === 'CROSS_CONTRACT_CALL');
    if (!callbackTx || callbackTx.functionName !== 'on_oracle_resolved') {
        throw new Error('Expected cross-contract callback to on_oracle_resolved');
    }
    console.log(`  ✓ Verified TEE ECDSA signer (${resolution.signerAddress}) via near.ecrecover`);
    console.log('  ✓ Paid net NEAR bounty (after storage staking retention) to relayer & dispatched callback to market.predictee.near');

    // Verify ECDSA signature replay protection on req-2
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: 'req-2',
            outcome: 'YES',
            confidence_bps: 9250,
            attestation_hash: '0x7a9f82d1c6b3e401',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            evidence_digest: '0xfeedface',
            signed_text: canonicalMsg,
            ecdsa_signature: validSigForYes
        });
    }, 'Invalid signed_text: must match canonical PREDICTEE_RESOLVE_V3 message', 'Cross-request signature replay rejected');

    // Verify Native NEAR AI Cloud (/v1/signature/{chat_id}) Mode A verification on a new request (req-3)
    setContext('alice.near', oneNear);
    const req3Id = contract.request_resolution({
        query: 'Will Ethereum Pectra upgrade activate on mainnet in 2026?',
        category: 'Crypto'
    });
    const nativeReqBody = JSON.stringify({
        model: 'z-ai/glm-5.3-flash',
        messages: [{ role: 'user', content: 'Will Ethereum Pectra upgrade activate on mainnet in 2026?' }]
    });
    const nativeRespBody = JSON.stringify({
        id: 'chatcmpl-native-1',
        choices: [{ message: { content: '{"outcome":"YES","confidence_bps":9100,"rationale":"Verified on-chain activation epoch."}' } }]
    });
    const reqSha = createHash('sha256').update(nativeReqBody, 'utf8').digest('hex');
    const respSha = createHash('sha256').update(nativeRespBody, 'utf8').digest('hex');
    const nativeSignedText = `${reqSha}:${respSha}`;
    const nativeSig = signEip191(nativeSignedText, teeKeypair.secretKey);

    setContext('relayer.predictee.near', 0n);
    // Reject tampered outcome when using Native NEAR AI Cloud request_body/response_body verification
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: req3Id,
            outcome: 'NO', // Does not match response_body ("YES")
            confidence_bps: 9100,
            attestation_hash: '0xnativequote',
            enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
            signed_text: nativeSignedText,
            ecdsa_signature: nativeSig,
            request_body: nativeReqBody,
            response_body: nativeRespBody
        });
    }, 'Invalid response_body: does not match submitted outcome and confidence_bps', 'Native NEAR AI Cloud response_body tampering rejected');

    // Legitimate Native NEAR AI Cloud Mode A fulfillment
    const nativeRes = contract.fulfill_resolution({
        request_id: req3Id,
        outcome: 'YES',
        confidence_bps: 9100,
        attestation_hash: '0xnativequote',
        enclave_measurement: ATTESTED_ENCLAVE_MEASUREMENT,
        signed_text: nativeSignedText,
        ecdsa_signature: nativeSig,
        request_body: nativeReqBody,
        response_body: nativeRespBody
    });
    if (nativeRes.outcome !== 'YES' || nativeRes.signerAddress !== teeKeypair.address.toLowerCase()) {
        throw new Error('Native NEAR AI Cloud Mode A verification failed');
    }
    console.log('  ✓ Verified Native NEAR AI Cloud (/v1/signature/{chat_id} sha256(req):sha256(resp)) Mode A on-chain.\n');

    // -------------------------------------------------------------
    // Test 6: Request Cancellation & Deposit Refund
    // -------------------------------------------------------------
    console.log('--- TEST 6: Request Cancellation & Deposit Refund ---');
    setContext('stranger.near', 0n);
    expectThrow(() => {
        contract.cancel_request({ request_id: 'req-2' });
    }, 'Only requester or contract owner', 'Unauthorized cancel attempt');

    setContext('bob.near', 0n);
    transfers.length = 0;
    contract.cancel_request({ request_id: 'req-2' });
    const req2After = contract.get_request({ request_id: 'req-2' });
    if (req2After.status !== 'CANCELLED') {
        throw new Error('Expected req-2 status to be CANCELLED');
    }
    const expectedRefund = oneNear - BigInt(req2After.storagePaidYocto || '0');
    const refundTx = transfers.find(t => t.type === 'TRANSFER' && t.account === 'bob.near');
    if (!refundTx || refundTx.amount !== expectedRefund) {
        throw new Error(`Expected net refund ${expectedRefund} yoctoNEAR (after storage staking deduction) to bob.near`);
    }
    console.log('  ✓ Cancelled req-2 and refunded net bounty (after storage staking deduction) to bob.near\n');

    // -------------------------------------------------------------
    // Test 7: Bounded Paginated Views & Global Stats
    // -------------------------------------------------------------
    console.log('--- TEST 7: Bounded Paginated Views, Filter Queries & Global Stats ---');
    const resolvedList = contract.list_requests({ status: 'RESOLVED' });
    if (resolvedList.length !== 2 || resolvedList[0].requestId !== 'req-1' || resolvedList[1].requestId !== 'req-3') {
        throw new Error('Expected 2 resolved requests (req-1 and req-3)');
    }
    const stats = contract.get_stats();
    console.log('  Oracle Stats:', JSON.stringify(stats));
    if (stats.totalRequests !== 3 || stats.resolvedCount !== 2 || stats.cancelledCount !== 1) {
        throw new Error('Stats mismatch');
    }
    console.log('  ✓ Bounded pagination & global stats verified\n');

    // -------------------------------------------------------------
    // Test 8: Intent Registry, Refundable Cancellation & NEP-297 Events
    // -------------------------------------------------------------
    console.log('--- TEST 8: Cross-Chain Intent Registry, Refund & NEP-297 Audit ---');
    setContext('alice.near', oneNear);
    contract.register_intent({
        intentId: 'intent-1001',
        marketId: 'poly-1',
        side: 'BUY_YES',
        attestationHash: '0x7a9f82d1c6b3e401',
        enclaveMeasurement: INTEL_TDX_MRTD
    });
    const savedIntent = contract.get_intent({ intentId: 'intent-1001' });
    if (!savedIntent || savedIntent.status !== 'COMMITTED' || typeof savedIntent.timestamp !== 'string') {
        throw new Error('Saved intent invalid or timestamp not string-serialized');
    }
    transfers.length = 0;
    setContext('alice.near', 0n);
    contract.cancel_intent({ intentId: 'intent-1001' });
    const cancelledIntent = contract.get_intent({ intentId: 'intent-1001' });
    if (cancelledIntent.status !== 'CANCELLED' || !transfers.find(t => t.account === 'alice.near' && t.amount === oneNear)) {
        throw new Error('Expected intent cancellation to refund 1 NEAR to alice.near');
    }

    const nepEvents = loggedEvents.filter(l => l.startsWith('EVENT_JSON:'));
    console.log(`  ✓ Audited ${nepEvents.length} NEP-297 standardized events`);
    console.log('========================================================================');
    console.log('✅ ALL 8 SMART CONTRACT SIMULATION SUITES PASSED (100% SUCCESS)');
    console.log('========================================================================');
}

runSimulation();
