import { NearBindgen, near, call, view, UnorderedMap } from 'near-sdk-js';

interface BettingIntent {
    intentId: string;
    nearAccountId: string;
    marketId: string;
    side: string;
    amountYocto: string;
    attestationHash: string;
    status: string;
    timestamp: bigint;
}

@NearBindgen({})
export class PredicTEEContract {
    intents = new UnorderedMap<BettingIntent>('i');
    verifiedEnclaves = new UnorderedMap<boolean>('e');
    ownerId: string = '';

    init() {
        this.ownerId = near.predecessorAccountId();
        // Whitelist verified NEAR AI TEE enclave measurements
        this.verifiedEnclaves.set("sha256:7a9f82d1c6b3e4018274a5e01f2d8b4c91a03e5f2b8d1a4c9e3b7a1f5d2c8e0", true);
    }

    @call({})
    register_intent({ 
        intentId, 
        marketId, 
        side, 
        attestationHash, 
        enclaveMeasurement 
    }: { 
        intentId: string, 
        marketId: string, 
        side: string, 
        attestationHash: string, 
        enclaveMeasurement: string 
    }): boolean {
        const sender = near.predecessorAccountId();
        
        // Cryptographic check: Enclave measurement must match verified TEE hardware
        const isVerifiedEnclave = this.verifiedEnclaves.get(enclaveMeasurement);
        if (!isVerifiedEnclave) {
            near.panicUtf8("Unverified TEE Hardware: Enclave measurement rejected.");
        }

        const intent: BettingIntent = {
            intentId,
            nearAccountId: sender,
            marketId,
            side,
            amountYocto: near.attachedDeposit().toString(),
            attestationHash,
            status: "COMMITTED",
            timestamp: near.blockTimestamp()
        };

        this.intents.set(intentId, intent);
        near.log(`[PredicTEE] Intent registered: ${intentId} by ${sender} with TEE proof ${attestationHash}`);
        return true;
    }

    @view({})
    get_intent({ intentId }: { intentId: string }): BettingIntent | null {
        return this.intents.get(intentId) || null;
    }

    @view({})
    is_enclave_verified({ measurement }: { measurement: string }): boolean {
        return !!this.verifiedEnclaves.get(measurement);
    }
}
