/**
 * Deploys the compiled PredicTEE NEAR smart contract (`build/predictee.wasm`)
 * to a real NEAR Testnet account provisioned via NEAR's Testnet helper faucet.
 *
 * Outputs:
 *   - packages/contracts/deployed-testnet.json (safe public metadata + NearBlocks URL)
 *   - packages/contracts/.testnet-deploy.key.json (gitignored deployer keypair for CLI/agent)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve near-api-js from contracts or sibling frontend package
let naj;
try {
  naj = require('near-api-js');
} catch {
  naj = require(path.resolve(__dirname, '../frontend/node_modules/near-api-js/lib/index.js'));
}

const { connect, keyStores, KeyPair } = naj;

const WASM_PATH = path.resolve(__dirname, 'build/predictee.wasm');
const KEY_FILE = path.resolve(__dirname, '.testnet-deploy.key.json');
const DEPLOYED_META_FILE = path.resolve(__dirname, 'deployed-testnet.json');
const RPC_URL = 'https://rpc.testnet.near.org';

async function provisionTestnetAccount() {
  if (fs.existsSync(KEY_FILE)) {
    const existing = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    if (existing.accountId && existing.secretKey) {
      console.log(`Reusing existing testnet account from .testnet-deploy.key.json: ${existing.accountId}`);
      return existing;
    }
  }

  const suffix = Math.floor(Date.now() / 1000).toString(36);
  const accountId = `predictee-${suffix}.testnet`;
  const keyPair = KeyPair.fromRandom('ed25519');
  const publicKey = keyPair.getPublicKey().toString();
  const secretKey = keyPair.toString();

  console.log(`Creating & funding NEAR Testnet account: ${accountId} ...`);
  const resp = await fetch('https://helper.testnet.near.org/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newAccountId: accountId,
      newAccountPublicKey: publicKey,
    }),
  });

  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`Helper faucet failed (${resp.status}): ${bodyText}`);
  }

  const creds = { accountId, publicKey, secretKey };
  fs.writeFileSync(KEY_FILE, JSON.stringify(creds, null, 2));
  console.log(`Funded 10 NEAR on Testnet! Account: ${accountId}`);
  return creds;
}

async function main() {
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`WASM not found at ${WASM_PATH}. Build it first with near-sdk-js build.`);
  }

  const wasmBytes = fs.readFileSync(WASM_PATH);
  console.log(`Loaded WASM (${(wasmBytes.length / 1024).toFixed(1)} KB): ${WASM_PATH}`);

  const creds = await provisionTestnetAccount();
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey('testnet', creds.accountId, KeyPair.fromString(creds.secretKey));

  const near = await connect({
    networkId: 'testnet',
    keyStore,
    nodeUrl: RPC_URL,
  });

  const account = await near.account(creds.accountId);
  const stateBefore = await account.state();
  console.log(`Account balance: ${(Number(stateBefore.amount) / 1e24).toFixed(4)} NEAR`);

  let deployTxHash = null;
  if (stateBefore.code_hash === '11111111111111111111111111111111') {
    console.log(`Deploying ${WASM_PATH} to ${creds.accountId} ...`);
    const deployOutcome = await account.deployContract(wasmBytes);
    deployTxHash = deployOutcome.transaction?.hash || null;
    console.log(`Deployed! Tx Hash: ${deployTxHash}`);

    console.log(`Calling init({ owner_id: "${creds.accountId}" }) ...`);
    const initOutcome = await account.functionCall({
      contractId: creds.accountId,
      methodName: 'init',
      args: { owner_id: creds.accountId },
      gas: BigInt('100000000000000'),
    });
    console.log(`Initialized! Tx Hash: ${initOutcome.transaction?.hash}`);
  } else {
    console.log(`Contract code already deployed (code_hash: ${stateBefore.code_hash}). Skipping deploy & init.`);
  }

  // Verify live view calls against NEAR Testnet RPC
  const stats = await account.viewFunction({
    contractId: creds.accountId,
    methodName: 'get_stats',
    args: {},
  });
  const enclaves = await account.viewFunction({
    contractId: creds.accountId,
    methodName: 'list_enclaves',
    args: {},
  });

  console.log('Live Testnet get_stats():', JSON.stringify(stats));
  console.log(`Live Testnet list_enclaves(): ${enclaves.length} verified TEE enclaves registered on-chain.`);

  const meta = {
    network: 'testnet',
    contractId: creds.accountId,
    ownerId: creds.accountId,
    rpcUrl: RPC_URL,
    mpcContractId: 'v1.signer-prod.testnet',
    wasmBytes: wasmBytes.length,
    deployTxHash,
    explorerUrl: `https://testnet.nearblocks.io/address/${creds.accountId}`,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(DEPLOYED_META_FILE, JSON.stringify(meta, null, 2));
  console.log(`\nSaved contract metadata to ${DEPLOYED_META_FILE}`);
  console.log(`Explorer: ${meta.explorerUrl}`);
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
