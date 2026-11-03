/**
 * PredicTEE Contract Verification & Simulation Suite
 * Demonstrates:
 * 1. Contract Initialization and Owner setup
 * 2. On-Chain TEE Enclave Hardware Whitelist & Permissions
 * 3. Oracle Request Creation with attached Deposit (Bounty)
 * 4. TEE Attestation & Measurement Enforcement (Rejection of unverified / rogue hardware)
 * 5. Request Fulfillment, State Transitions, and Resolver Bounty Payout
 * 6. Request Cancellation & Refund
 * 7. Paginated Views, Filter Queries, and Global Stats
 * 8. Backward-Compatible Intent Registry
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractDir = path.resolve(__dirname, '..');

// 1. Ensure bundle exists
const bundlePath = path.join(contractDir, 'build', 'bundle.cjs');
console.log('🔄 Compiling / bundling contract for simulation...');
execSync(`npx esbuild src/index.ts --bundle --platform=node --outfile=build/bundle.cjs`, {
    cwd: contractDir,
    stdio: 'ignore'
});
console.log('✅ Contract bundled successfully.\n');

// 2. Setup mock NEAR Runtime Environment
const storage = new Map();
const registers = new Map();
const loggedEvents = [];
const transfers = [];

let currentSender = 'oracle.predictee.near';
let currentDeposit = 0n;
let currentTimestamp = 1772678400000000000n; // ~March 2026

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
            functionName: fn,
            args: Buffer.from(args).toString('utf8'),
            type: 'CROSS_CONTRACT_CALL'
        });
    },
    promise_return: () => {}
};

// Helpers for test execution
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

// 3. Run Simulation Tests
async function runSimulation() {
    console.log('========================================================================');
    console.log('           PREDICTEE NEAR SMART CONTRACT SIMULATION TEST SUITE          ');
    console.log('========================================================================\n');

    const contractModule = require(bundlePath);
    const contract = new contractModule.PredicTEEContract();

    // -------------------------------------------------------------
    // Test 1: Initialization
    // -------------------------------------------------------------
    console.log('--- TEST 1: Contract Initialization ---');
    setContext('deployer.near', 0n);
    contract.init({ owner_id: 'oracle.predictee.near' });
    console.log('Contract owner:', contract.ownerId);

    const initialEnclaves = contract.list_enclaves();
    console.log(`Registered default verified enclaves: ${initialEnclaves.length}`);
    initialEnclaves.forEach(e => console.log(`  - [${e.active ? 'ACTIVE' : 'DISABLED'}] ${e.label} (${e.measurement})`));

    const INTEL_TDX_MEASUREMENT = 'sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0';
    if (!contract.is_enclave_verified({ measurement: INTEL_TDX_MEASUREMENT })) {
        throw new Error('Default Intel TDX measurement must be verified');
    }
    console.log('✅ Initialization verified.\n');

    // -------------------------------------------------------------
    // Test 2: Owner Administration & TEE Whitelist Updates
    // -------------------------------------------------------------
    console.log('--- TEST 2: Enclave Whitelist Management & Access Control ---');
    const NEW_ENCLAVE_MEASUREMENT = 'sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

    // Non-owner registration attempt
    setContext('stranger.near', 0n);
    expectThrow(() => {
        contract.register_tee_enclave({
            measurement: NEW_ENCLAVE_MEASUREMENT,
            label: 'Unauthorized Rogue Enclave'
        });
    }, 'Only contract owner can register TEE enclave', 'Non-owner enclave registration');

    // Owner registration
    setContext('oracle.predictee.near', 0n);
    contract.register_tee_enclave({
        measurement: NEW_ENCLAVE_MEASUREMENT,
        label: 'NEAR AI Secondary Cluster Intel TDX v2'
    });
    if (!contract.is_enclave_verified({ measurement: NEW_ENCLAVE_MEASUREMENT })) {
        throw new Error('Newly registered enclave should be verified');
    }
    console.log('  ✓ Owner registered new TEE enclave successfully');

    // Owner deactivates enclave
    contract.deactivate_tee_enclave({ measurement: NEW_ENCLAVE_MEASUREMENT });
    if (contract.is_enclave_verified({ measurement: NEW_ENCLAVE_MEASUREMENT })) {
        throw new Error('Deactivated enclave must not be verified');
    }
    console.log('  ✓ Owner deactivated TEE enclave successfully');
    console.log('✅ Access control verified.\n');

    // -------------------------------------------------------------
    // Test 3: Oracle Request Lifecycle & Attached Bounty
    // -------------------------------------------------------------
    console.log('--- TEST 3: Oracle Request Creation with Attached Bounty ---');

    // Zero-deposit request must fail
    setContext('alice.near', 0n);
    expectThrow(() => {
        contract.request_resolution({
            query: 'Will Solana hit $300 before EOY 2026?',
            category: 'Crypto Milestones'
        });
    }, 'Resolution request requires a non-zero bounty deposit', 'Zero deposit rejection');

    // Empty query must fail
    setContext('alice.near', 1000000000000000000000000n);
    expectThrow(() => {
        contract.request_resolution({
            query: '   ',
            category: 'Crypto Milestones'
        });
    }, 'Resolution query prompt cannot be empty', 'Empty query rejection');

    // Valid Request 1 by Alice: 2.0 NEAR bounty
    setContext('alice.near', 2000000000000000000000000n); // 2 NEAR
    const reqId1 = contract.request_resolution({
        query: 'Will Solana hit $300 before EOY 2026?',
        category: 'Crypto Milestones'
    });
    console.log(`  ✓ Request 1 created: ID=${reqId1} by alice.near (2.0 NEAR bounty)`);

    // Valid Request 2 by Bob: 1.5 NEAR bounty
    setContext('bob.near', 1500000000000000000000000n); // 1.5 NEAR
    const reqId2 = contract.request_resolution({
        query: 'Fed Rate Decision Dec 2026: 25 bps hike?',
        category: 'Macro & Fed'
    });
    console.log(`  ✓ Request 2 created: ID=${reqId2} by bob.near (1.5 NEAR bounty)`);

    // Valid Request 3 by Charlie: 0.5 NEAR bounty
    setContext('charlie.near', 500000000000000000000000n); // 0.5 NEAR
    const reqId3 = contract.request_resolution({
        query: 'DeepSeek-V4 SWE-bench Score > GPT-5?',
        category: 'AI Benchmarks',
        callback_contract: 'market_settlement.near',
        callback_method: 'oracle_callback'
    });
    console.log(`  ✓ Request 3 created: ID=${reqId3} by charlie.near (0.5 NEAR bounty, with callback)`);

    const r1 = contract.get_request({ request_id: reqId1 });
    if (!r1 || r1.status !== 'PENDING' || r1.bountyYocto !== '2000000000000000000000000') {
        throw new Error('Request 1 state incorrect');
    }
    console.log('✅ Request creation and storage verified.\n');

    // -------------------------------------------------------------
    // Test 4: TEE Enclave Verification on Fulfillment
    // -------------------------------------------------------------
    console.log('--- TEST 4: TEE Cryptographic Verification Enforcement ---');

    // Unverified/rogue measurement attempt
    const ROGUE_MEASUREMENT = 'sha256:0000000000000000000000000000000000000000000000000000000000deadbeef';
    setContext('rogue_worker.near', 0n);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: reqId1,
            outcome: 'YES',
            confidence_bps: 9500,
            attestation_hash: '0xmockquote123',
            enclave_measurement: ROGUE_MEASUREMENT
        });
    }, 'Unverified TEE Hardware: Enclave measurement rejected.', 'Rogue enclave fulfill rejection');

    // Deactivated measurement attempt
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: reqId1,
            outcome: 'YES',
            confidence_bps: 9500,
            attestation_hash: '0xmockquote123',
            enclave_measurement: NEW_ENCLAVE_MEASUREMENT
        });
    }, 'Unverified TEE Hardware: Enclave measurement rejected.', 'Deactivated enclave fulfill rejection');

    // Invalid confidence BPS (>10000)
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: reqId1,
            outcome: 'YES',
            confidence_bps: 12000,
            attestation_hash: '0xmockquote123',
            enclave_measurement: INTEL_TDX_MEASUREMENT
        });
    }, 'confidence_bps must be between 0 and 10000', 'Confidence out of bounds rejection');

    console.log('✅ TEE Hardware verification strictly enforced on-chain.\n');

    // -------------------------------------------------------------
    // Test 5: Legitimate TEE Fulfillment & Bounty Payout
    // -------------------------------------------------------------
    console.log('--- TEST 5: Legitimate TEE Fulfillment & Bounty Release ---');
    setContext('tee_node_01.near', 0n);
    const initialTransfersCount = transfers.length;

    const resolution1 = contract.fulfill_resolution({
        request_id: reqId1,
        outcome: 'YES',
        confidence_bps: 9120, // 91.2%
        attestation_hash: '0x7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0a',
        enclave_measurement: INTEL_TDX_MEASUREMENT,
        evidence_digest: 'sha256:polymarket_gamma_orderbook_synthesized_sentiment'
    });

    console.log('Resolution returned:');
    console.log(`  - Request ID: ${resolution1.requestId}`);
    console.log(`  - Outcome: ${resolution1.outcome}`);
    console.log(`  - Confidence: ${resolution1.confidenceBps / 100}% (${resolution1.confidenceBps} bps)`);
    console.log(`  - Resolver: ${resolution1.resolver}`);
    console.log(`  - Attestation Quote Hash: ${resolution1.attestationHash}`);

    // Verify request state changed to RESOLVED
    const r1After = contract.get_request({ request_id: reqId1 });
    if (!r1After || r1After.status !== 'RESOLVED' || !r1After.resolvedAt) {
        throw new Error('Request 1 was not updated to RESOLVED');
    }
    console.log('  ✓ Request 1 status successfully transitioned to RESOLVED');

    // Verify bounty payout
    const payout = transfers.find(t => t.account === 'tee_node_01.near');
    if (!payout || payout.amount !== 2000000000000000000000000n) {
        throw new Error('Resolver bounty payout transfer missing or incorrect amount');
    }
    console.log(`  ✓ 2.0 NEAR bounty transferred to resolver tee_node_01.near`);

    // Verify cannot re-fulfill an already resolved request
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: reqId1,
            outcome: 'NO',
            confidence_bps: 8000,
            attestation_hash: '0xabc',
            enclave_measurement: INTEL_TDX_MEASUREMENT
        });
    }, 'is not in PENDING state (status: RESOLVED)', 'Re-fulfillment rejection');

    console.log('✅ Legitimate fulfillment and bounty settlement verified.\n');

    // -------------------------------------------------------------
    // Test 6: Request Cancellation & Refund
    // -------------------------------------------------------------
    console.log('--- TEST 6: Request Cancellation & Deposit Refund ---');
    // Unauthorized cancellation by attacker
    setContext('stranger.near', 0n);
    expectThrow(() => {
        contract.cancel_request({ request_id: reqId2 });
    }, 'Only requester or contract owner can cancel the request', 'Unauthorized cancellation rejection');

    // Authorized cancellation by Bob (requester)
    setContext('bob.near', 0n);
    contract.cancel_request({ request_id: reqId2 });
    const r2After = contract.get_request({ request_id: reqId2 });
    if (!r2After || r2After.status !== 'CANCELLED') {
        throw new Error('Request 2 was not cancelled');
    }
    const bobRefund = transfers.find(t => t.account === 'bob.near');
    if (!bobRefund || bobRefund.amount !== 1500000000000000000000000n) {
        throw new Error('Bob refund transfer not recorded');
    }
    console.log('  ✓ Request 2 cancelled and 1.5 NEAR refunded to bob.near');

    // Cannot fulfill cancelled request
    setContext('tee_node_01.near', 0n);
    expectThrow(() => {
        contract.fulfill_resolution({
            request_id: reqId2,
            outcome: 'NO',
            confidence_bps: 8800,
            attestation_hash: '0xabc',
            enclave_measurement: INTEL_TDX_MEASUREMENT
        });
    }, 'is not in PENDING state (status: CANCELLED)', 'Cancelled request fulfillment rejection');
    console.log('✅ Cancellation lifecycle verified.\n');

    // -------------------------------------------------------------
    // Test 7: Paginated Listing and Global Stats
    // -------------------------------------------------------------
    console.log('--- TEST 7: Query Views, Pagination & Stats ---');
    const allRequests = contract.list_requests({ limit: 10 });
    console.log(`Total requests listed: ${allRequests.length}`);

    const resolvedRequests = contract.list_requests({ status: 'RESOLVED' });
    console.log(`Resolved requests: ${resolvedRequests.length} (IDs: ${resolvedRequests.map(r => r.requestId).join(', ')})`);

    const cancelledRequests = contract.list_requests({ status: 'CANCELLED' });
    console.log(`Cancelled requests: ${cancelledRequests.length} (IDs: ${cancelledRequests.map(r => r.requestId).join(', ')})`);

    const pendingRequests = contract.list_requests({ status: 'PENDING' });
    console.log(`Pending requests: ${pendingRequests.length} (IDs: ${pendingRequests.map(r => r.requestId).join(', ')})`);

    const stats = contract.get_stats();
    console.log('Oracle Statistics:');
    console.log(`  - Total Requests: ${stats.totalRequests}`);
    console.log(`  - Resolved Count: ${stats.resolvedCount}`);
    console.log(`  - Cancelled Count: ${stats.cancelledCount}`);
    console.log(`  - Pending Count: ${stats.pendingCount}`);
    console.log(`  - Total Bounties Paid: ${stats.totalBountiesPaidYocto} yoctoNEAR`);
    console.log(`  - Active Verified Enclaves: ${stats.activeEnclavesCount}`);

    if (stats.totalRequests !== 3 || stats.resolvedCount !== 1 || stats.cancelledCount !== 1 || stats.pendingCount !== 1) {
        throw new Error('Stats counters do not match test actions');
    }
    console.log('✅ Query views and stats verified.\n');

    // -------------------------------------------------------------
    // Test 8: Backward-Compatible Intent Registry
    // -------------------------------------------------------------
    console.log('--- TEST 8: Backward-Compatible Intent Registry ---');
    setContext('dave.near', 1000000000000000000000000n); // 1 NEAR

    // Intent registration with valid TEE measurement
    contract.register_intent({
        intentId: 'intent-market-001',
        marketId: 'pm-sol-300-eoy',
        side: 'BUY_YES',
        attestationHash: '0xmockquote_intent_proof',
        enclaveMeasurement: INTEL_TDX_MEASUREMENT
    });

    const intent = contract.get_intent({ intentId: 'intent-market-001' });
    if (!intent || intent.side !== 'BUY_YES' || intent.nearAccountId !== 'dave.near') {
        throw new Error('Intent not stored properly');
    }
    console.log('  ✓ Registered intent successfully:', intent.intentId, 'by', intent.nearAccountId);

    // Intent registration with invalid measurement
    expectThrow(() => {
        contract.register_intent({
            intentId: 'intent-market-fake',
            marketId: 'pm-sol-300-eoy',
            side: 'BUY_NO',
            attestationHash: '0xfake',
            enclaveMeasurement: ROGUE_MEASUREMENT
        });
    }, 'Unverified TEE Hardware: Enclave measurement rejected.', 'Rogue enclave intent rejection');

    console.log('✅ Intent registry backward compatibility verified.\n');

    // -------------------------------------------------------------
    // NEP-297 Events Summary
    // -------------------------------------------------------------
    console.log('--- NEP-297 Standard Event Log Audit ---');
    const nepEvents = loggedEvents.filter(l => l.startsWith('EVENT_JSON:'));
    console.log(`Total NEP-297 Events Emitted: ${nepEvents.length}`);
    nepEvents.forEach((ev, idx) => console.log(`  ${idx + 1}. ${ev}`));

    console.log('\n========================================================================');
    console.log('🎉 ALL 8 CONTRACT SIMULATION TEST SUITES PASSED FLAWLESSLY!            ');
    console.log('========================================================================');
}

runSimulation().catch(err => {
    console.error('Simulation Failed:', err);
    process.exit(1);
});
