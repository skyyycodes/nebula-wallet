/**
 * Spending Account Manager
 * 
 * Manages a separate Ed25519 keypair for X402 micropayments.
 * This account is isolated from the main SPHINCS+ quantum-safe account
 * to enable fast, standard Stellar transactions for paid API calls.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from './modules/network/NetworkManager';
import type { SpendingAccount } from './types';
import {
  saveSpendingAccount,
  loadSpendingAccount,
  deleteSpendingAccount
} from './storage';

/**
 * Transaction queue to prevent "Bad Sequence" errors
 * when multiple X402 payments are made simultaneously
 */
class TransactionQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    
    this.processing = false;
  }
}

// Singleton transaction queue
const txQueue = new TransactionQueue();

/**
 * Create a new spending account
 */
export async function createSpendingAccount(): Promise<SpendingAccount> {
  const keypair = StellarSdk.Keypair.random();
  
  const account: SpendingAccount = {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    createdAt: Date.now()
  };
  
  await saveSpendingAccount(account);
  return account;
}

/**
 * Get the current spending account (or null if not created)
 */
export async function getSpendingAccount(): Promise<SpendingAccount | null> {
  return loadSpendingAccount();
}

/**
 * Get or create spending account
 */
export async function getOrCreateSpendingAccount(): Promise<SpendingAccount> {
  const existing = await loadSpendingAccount();
  if (existing) return existing;
  return createSpendingAccount();
}

/**
 * Delete the spending account
 */
export async function removeSpendingAccount(): Promise<void> {
  await deleteSpendingAccount();
}

/**
 * Get spending account balance
 */
export async function getSpendingBalance(): Promise<string> {
  const account = await loadSpendingAccount();
  if (!account) {
    return '0';
  }
  
  try {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const stellarAccount = await server.loadAccount(account.publicKey);
    
    const xlmBalance = stellarAccount.balances.find(
      (b): b is StellarSdk.Horizon.HorizonApi.BalanceLineNative =>
        b.asset_type === 'native'
    );
    
    return xlmBalance?.balance || '0';
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Not Found')) {
      return '0';
    }
    throw error;
  }
}

/**
 * Fund spending account with Friendbot (testnet only)
 */
export async function fundSpendingAccountWithFriendbot(): Promise<boolean> {
  const account = await loadSpendingAccount();
  if (!account) {
    throw new Error('No spending account found');
  }
  
  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    
    if (!config.friendbotUrl) {
      console.error('Friendbot not available on mainnet');
      return false;
    }
    
    const response = await fetch(`${config.friendbotUrl}?addr=${account.publicKey}`);
    return response.ok;
  } catch (error) {
    console.error('Friendbot funding failed:', error);
    return false;
  }
}

/**
 * Build and sign a payment transaction for X402
 * Uses the transaction queue to prevent sequence errors
 */
export async function signX402Payment(
  destinationAddress: string,
  amountStroops: string,
  memoText?: string
): Promise<{ xdr: string; hash: string }> {
  return txQueue.enqueue(async () => {
    const account = await loadSpendingAccount();
    if (!account) {
      throw new Error('No spending account found');
    }
    
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const config = networkManager.getConfig();
    const sourceAccount = await server.loadAccount(account.publicKey);
    
    // Convert stroops to XLM
    const amountXLM = (parseInt(amountStroops) / 10_000_000).toFixed(7);
    
    // Build transaction
    let txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: config.passphrase
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: destinationAddress,
        asset: StellarSdk.Asset.native(),
        amount: amountXLM
      }))
      .setTimeout(300); // 5 minute timeout
    
    // Add memo if provided
    if (memoText) {
      txBuilder = txBuilder.addMemo(StellarSdk.Memo.text(memoText.slice(0, 28)));
    }
    
    const transaction = txBuilder.build();
    
    // Sign with spending account keypair
    const keypair = StellarSdk.Keypair.fromSecret(account.secretKey);
    transaction.sign(keypair);
    
    return {
      xdr: transaction.toXDR(),
      hash: transaction.hash().toString('hex')
    };
  });
}

/**
 * Submit a signed transaction to the network
 */
export async function submitTransaction(xdr: string): Promise<{ hash: string }> {
  console.log('[Spending] Submitting transaction to Stellar network...');
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const transaction = StellarSdk.TransactionBuilder.fromXDR(xdr, config.passphrase);
  
  try {
    const result = await server.submitTransaction(transaction);
    console.log('[Spending] Transaction submitted successfully:', result.hash);
    return { hash: result.hash };
  } catch (error: any) {
    console.error('[Spending] Transaction submission failed:', error);
    // Extract Horizon error details
    if (error.response?.data?.extras?.result_codes) {
      const codes = error.response.data.extras.result_codes;
      console.error('[Spending] Result codes:', codes);
      throw new Error(`Transaction failed: ${JSON.stringify(codes)}`);
    }
    throw error;
  }
}

/**
 * Convert stroops to XLM string
 */
export function stroopsToXLM(stroops: string): string {
  return (parseInt(stroops) / 10_000_000).toFixed(7);
}

/**
 * Convert XLM to stroops string
 */
export function xlmToStroops(xlm: string): string {
  return Math.floor(parseFloat(xlm) * 10_000_000).toString();
}

/**
 * Check if spending account can afford a payment
 */
export async function canAffordPayment(amountStroops: string): Promise<boolean> {
  const balance = await getSpendingBalance();
  const balanceStroops = xlmToStroops(balance);
  
  // Leave some buffer for fees (1 XLM = 10_000_000 stroops, fee ~100 stroops)
  const required = parseInt(amountStroops) + 100;
  const available = parseInt(balanceStroops);
  
  return available >= required;
}
