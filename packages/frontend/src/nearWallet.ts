import {
  setupWalletSelector,
  actionCreators,
  type WalletSelector,
  type FinalExecutionOutcome,
} from '@near-wallet-selector/core';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupHotWallet } from '@near-wallet-selector/hot-wallet';
import { setupOKXWallet } from '@near-wallet-selector/okx-wallet';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import '@near-wallet-selector/modal-ui/styles.css';

export type NearNetworkId = 'testnet' | 'mainnet';

export const DEFAULT_TESTNET_CONTRACT_ID = 'predictee-to9sjg.testnet';
export const DEFAULT_MAINNET_CONTRACT_ID = 'predictee.near';

export interface WalletTxResult {
  txHash: string;
  successValue: unknown;
  rawOutcome: FinalExecutionOutcome | null;
}

/**
 * Exact string-based NEAR -> yoctoNEAR BigInt conversion (avoids IEEE-754 precision loss).
 */
export function nearToYoctoBigInt(amountNear: number | string): bigint {
  const str = String(amountNear).trim();
  if (!str || Number.isNaN(Number(str))) return 0n;
  const [wholePart, fracPart = ''] = str.split('.');
  const paddedFrac = (fracPart + '000000000000000000000000').slice(0, 24);
  const cleanWhole = wholePart.replace(/^0+/, '') || '0';
  return BigInt(cleanWhole + paddedFrac);
}

/**
 * Initializes the official NEAR Wallet Selector and Modal UI for the given network
 * (`testnet` or `mainnet`) with Meteor Wallet, MyNearWallet, HOT Wallet, and OKX Wallet.
 */
export async function createNearWalletSelector(
  network: NearNetworkId,
  contractId: string
): Promise<{ selector: WalletSelector; modal: WalletSelectorModal }> {
  const selector = await setupWalletSelector({
    network,
    modules: [
      setupMeteorWallet(),
      setupMyNearWallet(),
      setupHotWallet(),
      setupOKXWallet(),
    ],
  });

  const modal = setupModal(selector, {
    contractId,
    theme: 'dark',
  });

  return { selector, modal };
}

/**
 * Executes a real signed contract FunctionCall transaction through the connected NEAR Wallet
 * (e.g., opens Meteor Wallet browser extension / popup for signature approval & broadcast).
 */
export async function sendNearFunctionCall(params: {
  selector: WalletSelector;
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  gasTgas?: number;
  depositNear?: number | string;
  depositYocto?: string | bigint;
}): Promise<WalletTxResult> {
  const {
    selector,
    contractId,
    methodName,
    args,
    gasTgas = 100,
    depositNear,
    depositYocto,
  } = params;

  const state = selector.store.getState();
  const activeAcc = state.accounts.find((a) => a.active) || state.accounts[0];
  if (!activeAcc) {
    throw new Error('No active NEAR Wallet connected. Connect Meteor or MyNearWallet first.');
  }

  const wallet = await selector.wallet();
  const gasBigInt = BigInt(Math.max(10, Math.round(gasTgas))) * BigInt('1000000000000');
  let depositBigInt = 0n;
  if (depositYocto !== undefined) {
    depositBigInt = BigInt(depositYocto);
  } else if (depositNear !== undefined) {
    depositBigInt = nearToYoctoBigInt(depositNear);
  }

  const outcome = await wallet.signAndSendTransaction({
    signerId: activeAcc.accountId,
    receiverId: contractId,
    actions: [
      actionCreators.functionCall(
        methodName,
        args,
        gasBigInt,
        depositBigInt
      ),
    ],
  });

  if (!outcome) {
    // Redirect wallets complete the transaction via browser navigation redirect
    return {
      txHash: 'PENDING_WEB_REDIRECT',
      successValue: null,
      rawOutcome: null,
    };
  }

  const txHash = outcome.transaction?.hash || outcome.transaction_outcome?.id || '';
  let decodedSuccess: unknown = null;

  const statusObj = outcome.status as { SuccessValue?: string; Failure?: unknown } | undefined;
  if (statusObj?.Failure) {
    throw new Error(`NEAR transaction failed on-chain: ${JSON.stringify(statusObj.Failure)}`);
  }

  if (statusObj?.SuccessValue) {
    try {
      const rawJson = atob(statusObj.SuccessValue);
      decodedSuccess = JSON.parse(rawJson);
    } catch {
      decodedSuccess = statusObj.SuccessValue;
    }
  }

  return {
    txHash,
    successValue: decodedSuccess,
    rawOutcome: outcome,
  };
}
