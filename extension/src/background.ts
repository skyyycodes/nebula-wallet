/**
 * Background Service Worker
 *
 * Handles all wallet operations and serves as the central coordinator
 * between the popup, content scripts, and external websites
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  generateStellarKeypair,
  getAccountInfo,
  fundAccountWithFriendbot,
  buildPaymentTransaction,
  buildSwapTransaction,
  buildChangeTrustTransaction,
  buildLockAccountTransaction,
  getRecentTransactions,
  buildMultiSendTransaction,
  buildClaimableBalanceTransaction,
  buildClaimBalanceTransaction
} from './stellar';
import {
  getSphincsModule,
  uint8ArrayToBase64,
  base64ToUint8Array,
  hexToUint8Array
} from './sphincs';
import { getContractId } from './soroban';
import {
  addWallet,
  loadWallet,
  saveWallet,
  updateWalletLockStatus,
  getAllAccounts,
  switchAccount,
  deleteWallet,
  WalletData,
  loadServicePolicies,
  upsertServicePolicy,
  deleteServicePolicy,
  loadActivityLog,
  addActivityEntry,
  loadAgentConfig,
  loadConnectedSites,
  saveConnectedSite,
  removeConnectedSite,
  isOriginConnected,
  getConnectedSite,
  updateSiteLastUsed,
  ConnectedSite,
  getLastTransactionCursor,
  saveLastTransactionCursor,
  // Payment request functions
  createPaymentRequest,
  getPaymentRequestsForAddress,
  updatePaymentRequest,
  getPaymentRequest,
  cancelPaymentRequest,
  // Webhook functions
  registerWebhook,
  loadWebhooks,
  deleteWebhook,
  getWebhooksForEvent,
  // Multiwallet functions
  getWalletsByIds
} from './storage';
import type { ExtensionMessage, ExtensionResponse, ServicePolicy, AgentConfig, PaymentRequest, WebhookConfig, MultiwalletSendRequest, MultiwalletSendResult } from './types';
import { submitForHybridApproval, RELAYER_PUBLIC_KEY, registerOnChain } from './soroban';

// X402 imports
import {
  createSpendingAccount,
  getSpendingAccount,
  getSpendingBalance,
  fundSpendingAccountWithFriendbot
} from './spending';
import {
  processX402Payment,
  forceApprovePayment,
  parsePaymentRequirements
} from './x402';
import { getNetworkManager } from './modules/network/NetworkManager';
import { NetworkType } from './modules/network/types';
import {
  initializeAgent,
  getAgentStatus,
  updateAgentConfig,
  setupAlarmHandler,
  requestManualRecharge
} from './agent';
import {
  startAgent,
  stopAgent,
  getAgentRunnerStatus,
  getExecutionLogs,
  getRunningAgents,
  updateAgentRunnerConfig,
  initializeAgentRunner,
  getCurrentPrice,
  getDefaultConfig,
  getMainnetAssetPrice,
  getStrategyTemplates,
  createAgentFromTemplate,
  startMockDemo,
  setGlobalConfig,
  type ExecutionConfig,
  type StrategyTemplate,
  type Agent as AgentRunnerAgent
} from './agent-runner';

// Relayer URL - handles SPHINCS+ verification and transaction submission (localhost for testing)
// Relayer URL for quantum-safe transaction submission
const RELAYER_URL = "http://localhost:3001"; // Development
// const RELAYER_URL = "https://nebula-ext.vercel.app"; // Production

// Always use relayer mode (verifier is deprecated)
const USE_RELAYER = true;

// ============================================
// Approval Popup Management
// ============================================

interface PendingApproval {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  type: 'connect' | 'transaction';
  data: {
    origin: string;
    siteName: string;
    favicon?: string;
    // Transaction specific
    destination?: string;
    amount?: string;
    token?: string;
  };
  windowId?: number;
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Open approval popup window
 */
async function openApprovalPopup(
  type: 'connect' | 'transaction',
  data: {
    origin: string;
    siteName: string;
    favicon?: string;
    // Transaction specific
    destination?: string;
    amount?: string;
    token?: string;
  }
): Promise<boolean> {
  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    // Store pending approval
    pendingApprovals.set(requestId, {
      resolve,
      reject,
      type,
      data
    });

    // Build popup URL with parameters
    const params = new URLSearchParams({
      requestId,
      type,
      origin: data.origin,
      siteName: data.siteName,
      ...(data.favicon && { favicon: data.favicon }),
      ...(data.destination && { destination: data.destination }),
      ...(data.amount && { amount: data.amount }),
      ...(data.token && { token: data.token })
    });

    // Create popup window
    chrome.windows.create({
      url: `approval.html?${params.toString()}`,
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    }, (window) => {
      if (window?.id) {
        const pending = pendingApprovals.get(requestId);
        if (pending) {
          pending.windowId = window.id;
        }
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingApprovals.has(requestId)) {
        pendingApprovals.delete(requestId);
        resolve(false);
      }
    }, 300000);
  });
}

/**
 * Handle approval response from popup
 */
function handleApprovalResponse(requestId: string, approved: boolean): void {
  const pending = pendingApprovals.get(requestId);
  if (pending) {
    pendingApprovals.delete(requestId);
    pending.resolve(approved);
  }
}

// Listen for window close to reject pending approvals
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of pendingApprovals) {
    if (pending.windowId === windowId) {
      pendingApprovals.delete(requestId);
      pending.resolve(false);
    }
  }
});

/**
 * Get relayer's public key for account locking
 */
async function getRelayerPublicKey(): Promise<string> {
  const response = await fetch(`${RELAYER_URL}/public-key`);
  const data = await response.json();
  return data.public_key;
}

/**
 * Create a new quantum-safe wallet
 */
async function createWallet(): Promise<ExtensionResponse> {
  try {
    // Generate Stellar Ed25519 keypair
    const stellarKeys = generateStellarKeypair();

    // Generate SPHINCS+ keypair
    const sphincs = await getSphincsModule();
    const sphincsKeys = await sphincs.generateKeyPair();

    // Add wallet to storage
    const wallet = await addWallet({
      stellarPublicKey: stellarKeys.publicKey,
      stellarSecretKey: stellarKeys.secretKey,
      sphincsPublicKey: uint8ArrayToBase64(sphincsKeys.publicKey),
      sphincsSecretKey: uint8ArrayToBase64(sphincsKeys.secretKey),
      isLocked: false
    });

    // Switch to the new wallet
    await switchAccount(wallet.id);

    return {
      success: true,
      data: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.stellarPublicKey,
        isLocked: wallet.isLocked
      }
    };
  } catch (error) {
    console.error('Failed to create wallet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create wallet'
    };
  }
}

/**
 * Import an existing wallet from a SPHINCS+ secret key
 * The secret key structure (64 bytes = 4 * N where N=16):
 * - skSeed (0 to N)
 * - skPrf (N to 2*N)
 * - pkSeed (2*N to 3*N)
 * - root (3*N to 4*N)
 * The public key (32 bytes = 2 * N):
 * - pkSeed (0 to N)
 * - root (N to 2*N)
 */
async function importWallet(sphincsSecretKeyBase64: string): Promise<ExtensionResponse> {
  try {
    // Decode and validate SPHINCS+ secret key
    const sphincsSecretKey = base64ToUint8Array(sphincsSecretKeyBase64);

    // SPHINCS+ secret key should be 64 bytes (4 * N where N=16)
    if (sphincsSecretKey.length !== 64) {
      return {
        success: false,
        error: `Invalid SPHINCS+ key length: expected 64 bytes, got ${sphincsSecretKey.length}`
      };
    }

    // Extract public key components from secret key
    // pkSeed is at bytes 32-48 (2*N to 3*N)
    // root is at bytes 48-64 (3*N to 4*N)
    const N = 16;
    const pkSeed = sphincsSecretKey.slice(2 * N, 3 * N);
    const root = sphincsSecretKey.slice(3 * N, 4 * N);

    // Construct public key (pkSeed + root)
    const sphincsPublicKey = new Uint8Array(2 * N);
    sphincsPublicKey.set(pkSeed, 0);
    sphincsPublicKey.set(root, N);

    // Generate new Stellar Ed25519 keypair (can't derive from SPHINCS+)
    const stellarKeys = generateStellarKeypair();

    // Add wallet to storage
    const wallet = await addWallet({
      stellarPublicKey: stellarKeys.publicKey,
      stellarSecretKey: stellarKeys.secretKey,
      sphincsPublicKey: uint8ArrayToBase64(sphincsPublicKey),
      sphincsSecretKey: sphincsSecretKeyBase64,
      isLocked: false
    });

    // Switch to the new wallet
    await switchAccount(wallet.id);

    return {
      success: true,
      data: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.stellarPublicKey,
        isLocked: wallet.isLocked
      }
    };
  } catch (error) {
    console.error('Failed to import wallet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid SPHINCS+ secret key'
    };
  }
}

/**
 * Get current wallet info
 */
async function getWallet(): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    return {
      success: true,
      data: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.stellarPublicKey,
        isLocked: wallet.isLocked
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet'
    };
  }
}

/**
 * Get all accounts
 */
async function getAccounts(): Promise<ExtensionResponse> {
  try {
    const accounts = await getAllAccounts();
    const wallet = await loadWallet();

    return {
      success: true,
      data: {
        accounts: accounts.map(a => ({
          id: a.id,
          name: a.name,
          address: a.stellarPublicKey,
          isLocked: a.isLocked
        })),
        activeId: wallet?.id || null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get accounts'
    };
  }
}

/**
 * Switch to a different account
 */
async function switchToAccount(accountId: string): Promise<ExtensionResponse> {
  try {
    const wallet = await switchAccount(accountId);
    if (!wallet) {
      return { success: false, error: 'Account not found' };
    }

    return {
      success: true,
      data: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.stellarPublicKey,
        isLocked: wallet.isLocked
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to switch account'
    };
  }
}

/**
 * Delete an account
 */
async function deleteAccount(accountId: string): Promise<ExtensionResponse> {
  try {
    await deleteWallet(accountId);
    const wallet = await loadWallet();

    return {
      success: true,
      data: {
        activeWallet: wallet ? {
          id: wallet.id,
          name: wallet.name,
          address: wallet.stellarPublicKey,
          isLocked: wallet.isLocked
        } : null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete account'
    };
  }
}

/**
 * Check for incoming transactions
 */
async function checkForIncomingTransactions(publicKey: string, accountId: string): Promise<void> {
  try {
    const lastCursor = await getLastTransactionCursor(publicKey);
    const transactions = await getRecentTransactions(publicKey, 20);

    if (transactions.length === 0) {
      return;
    }

    // Save the newest cursor
    await saveLastTransactionCursor(publicKey, transactions[0].paging_token);

    // If this is the first check, don't log old transactions
    if (!lastCursor) {
      return;
    }

    // Process new transactions (those that come after our last cursor)
    for (const tx of transactions) {
      if (tx.paging_token === lastCursor) {
        break; // Stop when we reach transactions we've already seen
      }

      // Check if this is an incoming payment
      try {
        const networkManager = getNetworkManager();
        const server = networkManager.getServer();
        const operations = await server
          .operations()
          .forTransaction(tx.id)
          .call();

        for (const op of operations.records) {
          // Check for payment operations where we are the destination
          if (op.type === 'payment' &&
            (op as any).to === publicKey &&
            (op as any).asset_type === 'native') {

            const amount = (op as any).amount;
            const from = (op as any).from;

            // Log the incoming transaction
            await addActivityEntry({
              id: `rx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              accountId: accountId,
              type: 'receive',
              from: from,
              to: publicKey,
              amount: amount,
              status: 'completed',
              txHash: tx.hash,
              timestamp: new Date(tx.created_at).getTime()
            });

            console.log(`[Background] Logged incoming transaction: ${amount} XLM from ${from}`);
          }
        }
      } catch (err) {
        console.error('[Background] Failed to process transaction:', err);
      }
    }
  } catch (error) {
    console.error('[Background] Failed to check incoming transactions:', error);
  }
}

/**
 * Get account balance
 */
async function getBalance(): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    const accountInfo = await getAccountInfo(wallet.stellarPublicKey);
    if (!accountInfo) {
      return {
        success: true,
        data: { balance: '0', funded: false }
      };
    }

    // Update lock status from chain
    if (accountInfo.isLocked !== wallet.isLocked) {
      await updateWalletLockStatus(accountInfo.isLocked);
    }

    // Check for new incoming transactions
    checkForIncomingTransactions(wallet.stellarPublicKey, wallet.id).catch(err => {
      console.error('[Background] Failed to check incoming transactions:', err);
    });

    return {
      success: true,
      data: {
        balance: accountInfo.balance,
        funded: true,
        isLocked: accountInfo.isLocked
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get balance'
    };
  }
}

/**
 * Airdrop testnet XLM
 */
async function airdrop(): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    const funded = await fundAccountWithFriendbot(wallet.stellarPublicKey);
    if (!funded) {
      return { success: false, error: 'Friendbot funding failed' };
    }

    // Get updated balance
    const accountInfo = await getAccountInfo(wallet.stellarPublicKey);

    return {
      success: true,
      data: {
        balance: accountInfo?.balance || '10000',
        message: 'Funded with testnet XLM!'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Airdrop failed'
    };
  }
}

/**
 * Lock wallet to quantum-secure mode
 * Adds relayer as signer and sets masterWeight=0
 * All transactions must go through the relayer which verifies SPHINCS+ signatures
 */
async function lockWallet(): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    if (wallet.isLocked) {
      return { success: false, error: 'Wallet already locked' };
    }

    // Get the contract ID for account locking (use contract as sha256Hash signer)
    console.log('Getting quantum-safe contract ID...');
    const contractId = getContractId();
    console.log('Contract ID:', contractId);

    // Step 2: Build and submit lock transaction (add contract as signer, set masterWeight=0)
    const result = await buildLockAccountTransaction(
      wallet.stellarPublicKey,
      wallet.stellarSecretKey,
      contractId
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Update wallet state
    await updateWalletLockStatus(true);

    const modeMessage = 'Wallet locked with quantum-safe relayer! Ed25519 key can no longer sign transactions.';

    return {
      success: true,
      data: {
        hash: result.hash,
        message: modeMessage
      }
    };
  } catch (error) {
    console.error('Lock wallet failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to lock wallet'
    };
  }
}

/**
 * Send XLM using quantum-safe flow via relayer
 * The relayer verifies SPHINCS+ signature and submits the transaction
 */
async function sendXLM(to: string, amount: string): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    // Check if wallet is locked (quantum-safe mode)
    if (!wallet.isLocked) {
      return { success: false, error: 'Wallet must be locked for quantum-safe transactions' };
    }

    const sphincsPublicKey = base64ToUint8Array(wallet.sphincsPublicKey);
    // Memo hash only accepts 32 bytes, use first 32 bytes (pkSeed + root)
    const sphincsPublicKey32 = sphincsPublicKey.slice(0, 32);

    console.log('[SendXLM] Building quantum-safe transaction...');
    console.log('[SendXLM] Destination:', to);
    console.log('[SendXLM] Amount:', amount, 'XLM');

    // Build the payment transaction with SPHINCS+ public key in memo hash
    // Use sequenceOffset=1 because the relayer will rebuild with fresh sequence
    const { xdr, hash } = await buildPaymentTransaction(
      wallet.stellarPublicKey,
      to,
      amount,
      sphincsPublicKey32,  // Pass first 32 bytes of SPHINCS+ public key as memo
      1,  // sequence offset for relayer flow
      'hash'  // Use hash memo type
    );

    console.log('[SendXLM] Transaction hash:', hash);

    // Sign the transaction hash with SPHINCS+
    const sphincs = await getSphincsModule();
    const sphincsSecretKey = base64ToUint8Array(wallet.sphincsSecretKey);

    console.log('[SendXLM] Signing with SPHINCS+...');
    const hashBytes = hexToUint8Array(hash);
    const signature = await sphincs.sign(hashBytes, sphincsSecretKey);
    console.log('[SendXLM] Signature size:', signature.length, 'bytes');

    // Submit to relayer for verification and submission
    console.log('[SendXLM] Submitting to relayer...');

    const response = await fetch(`${RELAYER_URL}/api/verify-and-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stellarAddress: wallet.stellarPublicKey,
        txHash: hash,
        txXdr: xdr,
        sphincsSignature: uint8ArrayToBase64(signature)
      })
    });

    const result = await response.json();
    console.log('[SendXLM] Relayer response:', result);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Relayer rejected transaction'
      };
    }

    // Return the payment transaction hash
    const paymentHash = result.paymentTxHash || result.approvalTxHash || hash;

    // Log activity
    try {
      await addActivityEntry({
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accountId: wallet.id,
        type: 'send',
        to: to,
        amount: amount,
        status: 'completed',
        txHash: paymentHash,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[SendXLM] Failed to log activity:', err);
    }

    return {
      success: true,
      data: {
        txHash: paymentHash,
        approvalTxHash: result.approvalTxHash,
        stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${paymentHash}`,
        message: result.message || 'Transaction submitted successfully!'
      }
    };
  } catch (error) {
    console.error('[SendXLM] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send XLM'
    };
  }
}

/**
 * Swap tokens using Stellar DEX via the relayer
 */
async function swapTokens(
  sendAsset: { code: string; issuer: string | null },
  destAsset: { code: string; issuer: string | null },
  sendAmount: string,
  destMinAmount: string,
  pathAssets: Array<{ code: string; issuer: string | null }> = []
): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    // Check if wallet is locked (quantum-safe mode)
    if (!wallet.isLocked) {
      return { success: false, error: 'Wallet must be locked for quantum-safe transactions' };
    }

    const sphincsPublicKey = base64ToUint8Array(wallet.sphincsPublicKey);
    // Memo hash only accepts 32 bytes, use first 32 bytes (pkSeed + root)
    const sphincsPublicKey32 = sphincsPublicKey.slice(0, 32);

    console.log('[SwapTokens] Building quantum-safe swap transaction...');
    console.log('[SwapTokens] Send:', sendAmount, sendAsset.code);
    console.log('[SwapTokens] Receive min:', destMinAmount, destAsset.code);
    console.log('[SwapTokens] Path length:', pathAssets.length);

    // Build the swap transaction with SPHINCS+ public key in memo hash
    // Use sequenceOffset=1 because the relayer will rebuild with fresh sequence
    const { xdr, hash } = await buildSwapTransaction(
      wallet.stellarPublicKey,
      sendAsset,
      destAsset,
      sendAmount,
      destMinAmount,
      pathAssets,
      sphincsPublicKey32,  // Pass first 32 bytes of SPHINCS+ public key as memo
      1,  // sequence offset for relayer flow
      'hash'  // Use hash memo type
    );

    console.log('[SwapTokens] Transaction hash:', hash);

    // Sign the transaction hash with SPHINCS+
    const sphincs = await getSphincsModule();
    const sphincsSecretKey = base64ToUint8Array(wallet.sphincsSecretKey);

    console.log('[SwapTokens] Signing with SPHINCS+...');
    const hashBytes = hexToUint8Array(hash);
    const signature = await sphincs.sign(hashBytes, sphincsSecretKey);
    console.log('[SwapTokens] Signature size:', signature.length, 'bytes');

    // Submit to relayer for verification and submission
    // NOTE: We use the same /api/verify-and-submit endpoint as sendXLM
    // because it already handles ALL operation types, including pathPaymentStrictSend!
    console.log('[SwapTokens] Submitting to relayer...');

    const response = await fetch(`${RELAYER_URL}/api/verify-and-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stellarAddress: wallet.stellarPublicKey,
        txHash: hash,
        txXdr: xdr,
        sphincsSignature: uint8ArrayToBase64(signature)
      })
    });

    const result = await response.json();
    console.log('[SwapTokens] Relayer response:', result);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Relayer rejected swap transaction'
      };
    }

    // Return the swap transaction hash
    const swapHash = result.paymentTxHash || hash;

    // Log activity
    try {
      await addActivityEntry({
        id: `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accountId: wallet.id,
        type: 'swap',
        to: wallet.stellarPublicKey,
        amount: `${sendAmount} ${sendAsset.code} → ${destMinAmount} ${destAsset.code}`,
        status: 'completed',
        txHash: swapHash,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[SwapTokens] Failed to log activity:', err);
    }

    return {
      success: true,
      data: {
        txHash: swapHash,
        stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${swapHash}`,
        message: result.message || 'Swap submitted successfully!'
      }
    };
  } catch (error) {
    console.error('[SwapTokens] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute swap'
    };
  }
}

/**
 * Add trustline for an asset via the relayer (quantum-safe)
 */
async function addTrustline(
  assetCode: string,
  assetIssuer: string
): Promise<ExtensionResponse> {
  try {
    const wallet = await loadWallet();
    if (!wallet) {
      return { success: false, error: 'No wallet found' };
    }

    // Check if wallet is locked (quantum-safe mode)
    if (!wallet.isLocked) {
      return { success: false, error: 'Wallet must be locked for quantum-safe transactions' };
    }

    const sphincsPublicKey = base64ToUint8Array(wallet.sphincsPublicKey);
    const sphincsPublicKey32 = sphincsPublicKey.slice(0, 32);

    console.log('[AddTrustline] Building quantum-safe trustline transaction...');
    console.log('[AddTrustline] Asset:', assetCode, 'Issuer:', assetIssuer);

    // Build the change trust transaction
    const { xdr, hash } = await buildChangeTrustTransaction(
      wallet.stellarPublicKey,
      assetCode,
      assetIssuer,
      sphincsPublicKey32,
      1, // sequence offset for relayer flow
      'hash'
    );

    console.log('[AddTrustline] Transaction hash:', hash);

    // Sign with SPHINCS+
    const sphincs = await getSphincsModule();
    const sphincsSecretKey = base64ToUint8Array(wallet.sphincsSecretKey);

    console.log('[AddTrustline] Signing with SPHINCS+...');
    const hashBytes = hexToUint8Array(hash);
    const signature = await sphincs.sign(hashBytes, sphincsSecretKey);
    console.log('[AddTrustline] Signature size:', signature.length, 'bytes');

    // Submit to relayer
    console.log('[AddTrustline] Submitting to relayer...');

    const response = await fetch(`${RELAYER_URL}/api/verify-and-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stellarAddress: wallet.stellarPublicKey,
        txHash: hash,
        txXdr: xdr,
        sphincsSignature: uint8ArrayToBase64(signature)
      })
    });

    const result = await response.json();
    console.log('[AddTrustline] Relayer response:', result);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Relayer rejected trustline transaction'
      };
    }

    const trustlineTxHash = result.paymentTxHash || hash;

    return {
      success: true,
      data: {
        txHash: trustlineTxHash,
        message: `Trustline added for ${assetCode}`
      }
    };
  } catch (error) {
    console.error('[AddTrustline] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add trustline'
    };
  }
}

/**
 * Wait for a transaction to appear on Horizon
 */
async function waitForTransaction(txHash: string, timeoutMs: number): Promise<{ found: boolean }> {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 seconds
  const networkManager = getNetworkManager();
  const config = networkManager.getConfig();
  const horizonUrl = config.horizonUrl;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${horizonUrl}/transactions/${txHash}`);
      if (response.ok) {
        return { found: true };
      }
    } catch {
      // Transaction not found yet
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return { found: false };
}

/**
 * Handle connect request from website (with approval flow)
 */
async function connectWithApproval(
  origin: string | undefined,
  skipApproval: boolean = false
): Promise<ExtensionResponse> {
  const wallet = await loadWallet();
  if (!wallet) {
    return { success: false, error: 'No wallet found. Please create a wallet first.' };
  }

  if (!origin) {
    return { success: false, error: 'Unknown origin' };
  }

  // Check if already connected
  const alreadyConnected = await isOriginConnected(origin);
  if (alreadyConnected) {
    // Update last used timestamp
    await updateSiteLastUsed(origin);
    return {
      success: true,
      data: { address: wallet.stellarPublicKey }
    };
  }

  // Skip approval if requested (internal use only)
  if (skipApproval) {
    return {
      success: true,
      data: { address: wallet.stellarPublicKey }
    };
  }

  // Open approval popup
  const siteName = new URL(origin).hostname;
  const approved = await openApprovalPopup('connect', {
    origin,
    siteName
  });

  if (!approved) {
    return { success: false, error: 'User rejected connection' };
  }

  // Save connected site
  await saveConnectedSite({
    origin,
    name: siteName,
    connectedAt: Date.now(),
    lastUsed: Date.now(),
    permissions: ['connect']
  });

  return {
    success: true,
    data: { address: wallet.stellarPublicKey }
  };
}

/**
 * Get all connected sites
 */
async function getConnectedSites(): Promise<ExtensionResponse> {
  try {
    const sites = await loadConnectedSites();
    return {
      success: true,
      data: { sites: Object.values(sites) }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get connected sites'
    };
  }
}

/**
 * Disconnect a site
 */
async function disconnectSite(origin: string): Promise<ExtensionResponse> {
  try {
    await removeConnectedSite(origin);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disconnect site'
    };
  }
}

/**
 * Check if a site is connected
 */
async function checkSiteConnection(origin: string): Promise<ExtensionResponse> {
  try {
    const connected = await isOriginConnected(origin);
    const wallet = connected ? await loadWallet() : null;
    return {
      success: true,
      data: {
        connected,
        address: connected && wallet ? wallet.stellarPublicKey : null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check connection'
    };
  }
}

/**
 * Request transaction approval from user
 */
async function requestTransactionApproval(
  origin: string,
  destination: string,
  amount: string,
  token: string = 'XLM'
): Promise<boolean> {
  const siteName = new URL(origin).hostname;
  return openApprovalPopup('transaction', {
    origin,
    siteName,
    destination,
    amount,
    token
  });
}

/**
 * Send XLM with approval flow
 */
async function sendXLMWithApproval(
  to: string,
  amount: string,
  origin?: string
): Promise<ExtensionResponse> {
  // If origin is provided, request approval first
  if (origin) {
    const approved = await requestTransactionApproval(origin, to, amount, 'XLM');
    if (!approved) {
      return { success: false, error: 'Transaction rejected by user' };
    }
  }

  // Proceed with the actual transaction
  return sendXLM(to, amount);
}

/**
 * Swap tokens with approval flow
 */
async function swapTokensWithApproval(
  sendAsset: { code: string; issuer: string | null },
  destAsset: { code: string; issuer: string | null },
  sendAmount: string,
  destMinAmount: string,
  pathAssets: Array<{ code: string; issuer: string | null }> = [],
  origin?: string
): Promise<ExtensionResponse> {
  // If origin is provided, request approval first
  if (origin) {
    const approved = await requestTransactionApproval(
      origin,
      'Self (Swap)',
      `${sendAmount} ${sendAsset.code} → ${destMinAmount}+ ${destAsset.code}`,
      'SWAP'
    );
    if (!approved) {
      return { success: false, error: 'Swap rejected by user' };
    }
  }

  // Proceed with the actual swap
  return swapTokens(sendAsset, destAsset, sendAmount, destMinAmount, pathAssets);
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    console.log('[Background] Received message:', message.type, message);

    // Quick test endpoint
    if (message.type === 'PING') {
      sendResponse({ success: true, data: { pong: true, timestamp: Date.now() } });
      return true;
    }

    const handleMessage = async () => {
      switch (message.type) {
        case 'CREATE_WALLET':
          return createWallet();

        case 'IMPORT_WALLET': {
          const payload = message.payload as { secretKey: string };
          return importWallet(payload.secretKey);
        }

        case 'GET_WALLET':
          return getWallet();

        case 'GET_WALLET_KEYS': {
          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'No wallet found' };
          }
          return {
            success: true,
            data: {
              stellarPublicKey: wallet.stellarPublicKey,
              stellarSecretKey: wallet.stellarSecretKey,
              sphincsPublicKey: wallet.sphincsPublicKey,
              sphincsSecretKey: wallet.sphincsSecretKey,
              isLocked: wallet.isLocked
            }
          };
        }

        case 'GET_ACCOUNTS':
          return getAccounts();

        case 'SWITCH_ACCOUNT': {
          const payload = message.payload as { accountId: string };
          return switchToAccount(payload.accountId);
        }

        case 'DELETE_ACCOUNT': {
          const payload = message.payload as { accountId: string };
          return deleteAccount(payload.accountId);
        }

        case 'GET_BALANCE':
          return getBalance();

        case 'GET_BALANCE_FOR_ACCOUNT': {
          const payload = message.payload as { accountId: string };
          try {
            // Use getAllAccounts() function which properly loads accounts
            const accounts = await getAllAccounts();

            if (!accounts || accounts.length === 0) {
              return { success: false, error: 'No accounts found' };
            }

            const account = accounts.find(a => a.id === payload.accountId);
            if (!account) {
              return { success: false, error: 'Account not found' };
            }

            // Get balance from Stellar network
            const accountInfo = await getAccountInfo(account.stellarPublicKey);
            return {
              success: true,
              data: { balance: accountInfo?.balance || '0' }
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get balance'
            };
          }
        }

        case 'AIRDROP':
          return airdrop();

        case 'LOCK_WALLET':
          return lockWallet();

        case 'SEND_XLM': {
          const payload = message.payload as { to: string; amount: string };
          // Get origin from sender for approval flow
          const txOrigin = _sender.origin || (_sender.tab?.url ? new URL(_sender.tab.url).origin : undefined);
          return sendXLMWithApproval(payload.to, payload.amount, txOrigin);
        }

        case 'SWAP_TOKENS': {
          const payload = message.payload as {
            sendAsset: { code: string; issuer: string | null };
            destAsset: { code: string; issuer: string | null };
            sendAmount: string;
            destMinAmount: string;
            pathAssets?: Array<{ code: string; issuer: string | null }>;
          };
          // Get origin from sender for approval flow
          const txOrigin = _sender.origin || (_sender.tab?.url ? new URL(_sender.tab.url).origin : undefined);
          return swapTokensWithApproval(
            payload.sendAsset,
            payload.destAsset,
            payload.sendAmount,
            payload.destMinAmount,
            payload.pathAssets || [],
            txOrigin
          );
        }

        case 'ADD_TRUSTLINE': {
          const payload = message.payload as {
            assetCode: string;
            assetIssuer: string;
          };
          return addTrustline(payload.assetCode, payload.assetIssuer);
        }

        case 'CONNECT': {
          // Get origin from sender
          const origin = _sender.origin || (_sender.tab?.url ? new URL(_sender.tab.url).origin : undefined);
          return connectWithApproval(origin);
        }

        case 'GET_CONNECTED_SITES':
          return getConnectedSites();

        case 'GET_ACTIVITY_LOG': {
          try {
            const wallet = await loadWallet();
            const activities = await loadActivityLog();
            // Filter activities by current account
            const filtered = wallet
              ? activities.filter(a => a.accountId === wallet.id)
              : [];
            return { success: true, data: filtered };
          } catch (error) {
            return { success: false, error: 'Failed to load activity log' };
          }
        }

        case 'DISCONNECT_SITE': {
          const payload = message.payload as { origin: string };
          return disconnectSite(payload.origin);
        }

        case 'IS_CONNECTED': {
          const origin = _sender.origin || (_sender.tab?.url ? new URL(_sender.tab.url).origin : undefined);
          if (!origin) {
            return { success: false, error: 'Unknown origin' };
          }
          return checkSiteConnection(origin);
        }

        case 'APPROVAL_RESPONSE': {
          const payload = message.payload as { requestId: string; approved: boolean };
          handleApprovalResponse(payload.requestId, payload.approved);
          return { success: true };
        }

        case 'GET_NETWORK': {
          const networkManager = getNetworkManager();
          const config = networkManager.getConfig();
          return {
            success: true,
            data: {
              network: config.type,
              name: config.name,
              isTestnet: config.isTestNetwork
            }
          };
        }

        case 'SET_NETWORK': {
          const payload = message.payload as { network: 'testnet' | 'mainnet' };
          console.log('[Background] SET_NETWORK request:', payload.network);
          const networkManager = getNetworkManager();
          const targetNetwork = payload.network === 'testnet' ? NetworkType.TESTNET : NetworkType.MAINNET;
          console.log('[Background] Target network type:', targetNetwork);
          await networkManager.switchNetwork(targetNetwork);
          const config = networkManager.getConfig();
          console.log('[Background] After switch, config:', { type: config.type, name: config.name });
          return {
            success: true,
            data: {
              network: config.type,
              name: config.name,
              isTestnet: config.isTestNetwork
            }
          };
        }

        // X402 Message Handlers
        case 'X402_GET_SPENDING_ACCOUNT': {
          const account = await getSpendingAccount();
          if (!account) {
            return { success: true, data: { exists: false } };
          }
          return {
            success: true,
            data: {
              exists: true,
              address: account.publicKey,
              createdAt: account.createdAt
            }
          };
        }

        case 'X402_CREATE_SPENDING_ACCOUNT': {
          const account = await createSpendingAccount();
          return {
            success: true,
            data: {
              address: account.publicKey,
              createdAt: account.createdAt
            }
          };
        }

        case 'X402_FUND_SPENDING_ACCOUNT': {
          const funded = await fundSpendingAccountWithFriendbot();
          if (!funded) {
            return { success: false, error: 'Friendbot funding failed' };
          }
          const balance = await getSpendingBalance();
          return {
            success: true,
            data: { balance, message: 'Funded with testnet XLM!' }
          };
        }

        case 'X402_GET_SPENDING_BALANCE': {
          const balance = await getSpendingBalance();
          return { success: true, data: { balance } };
        }

        case 'X402_SIGN_PAYMENT': {
          try {
            const payload = message.payload as {
              origin: string;
              requirements: unknown;
              forceApprove?: boolean;
            } | undefined;

            // Debug: Return what we received
            if (!payload) {
              return {
                success: false,
                error: 'No payload received',
                debug: { messagePayload: message.payload }
              };
            }

            const rawRequirements = payload.requirements;

            // Try parsing
            let requirements;
            try {
              requirements = parsePaymentRequirements(rawRequirements);
            } catch (parseError) {
              return {
                success: false,
                error: 'Parse error: ' + (parseError instanceof Error ? parseError.message : String(parseError)),
                debug: { rawRequirements: JSON.stringify(rawRequirements)?.slice(0, 500) }
              };
            }

            if (!requirements) {
              return {
                success: false,
                error: 'Invalid payment requirements',
                debug: {
                  payloadKeys: Object.keys(payload),
                  rawReqType: typeof rawRequirements,
                  rawReqKeys: rawRequirements && typeof rawRequirements === 'object' ? Object.keys(rawRequirements as object) : [],
                  rawReqStr: JSON.stringify(rawRequirements)?.slice(0, 500)
                }
              };
            }

            const result = payload.forceApprove
              ? await forceApprovePayment(payload.origin, requirements)
              : await processX402Payment(payload.origin, requirements);

            if (!result.success) {
              return {
                success: false,
                error: result.error,
                data: { needsPrompt: 'needsPrompt' in result ? result.needsPrompt : false }
              };
            }

            return {
              success: true,
              data: {
                xPaymentHeader: result.xPaymentHeader,
                paymentSignature: result.xPaymentHeader,
                txHash: result.txHash,
                activityId: result.activityId,
                submitted: result.submitted,
                stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${result.txHash}`
              }
            };
          } catch (err) {
            return {
              success: false,
              error: 'X402 handler error: ' + (err instanceof Error ? err.message : String(err))
            };
          }
        }

        case 'X402_GET_SERVICES': {
          const policies = await loadServicePolicies();
          return {
            success: true,
            data: { services: Object.values(policies) }
          };
        }

        case 'X402_UPDATE_SERVICE_POLICY': {
          const policy = message.payload as ServicePolicy;
          await upsertServicePolicy(policy);
          return { success: true };
        }

        case 'X402_DELETE_SERVICE': {
          const { origin } = message.payload as { origin: string };
          await deleteServicePolicy(origin);
          return { success: true };
        }

        case 'X402_GET_ACTIVITY': {
          const activity = await loadActivityLog();
          return { success: true, data: { activity } };
        }

        case 'X402_GET_AGENT_STATUS': {
          const status = await getAgentStatus();
          const config = await loadAgentConfig();
          return {
            success: true,
            data: { status, config }
          };
        }

        case 'X402_SET_AGENT_CONFIG': {
          const updates = message.payload as Partial<AgentConfig>;
          const newConfig = await updateAgentConfig(updates);
          return { success: true, data: { config: newConfig } };
        }

        case 'X402_REQUEST_RECHARGE': {
          const result = await requestManualRecharge();
          return result;
        }

        // ============ Agent Runner Commands ============

        case 'START_AGENT': {
          const agentPayload = message.payload as {
            id: string;
            name: string;
            description: string;
            blocks: any[];
            connections: any[];
            isActive: boolean;
            status: 'draft' | 'active' | 'paused';
            executionConfig?: ExecutionConfig;
          };
          const startResult = startAgent(agentPayload);
          return {
            success: startResult.success,
            error: startResult.error,
            data: startResult.success ? { agentId: agentPayload.id } : undefined
          };
        }

        case 'STOP_AGENT': {
          const { agentId } = message.payload as { agentId: string };
          const stopResult = stopAgent(agentId);
          return {
            success: stopResult.success,
            error: stopResult.error
          };
        }

        case 'GET_AGENT_RUNNER_STATUS': {
          const { agentId } = message.payload as { agentId: string };
          const status = getAgentRunnerStatus(agentId);
          return {
            success: true,
            data: status
          };
        }

        case 'GET_EXECUTION_LOGS': {
          const logsPayload = message.payload as { agentId?: string } | undefined;
          const logs = getExecutionLogs(logsPayload?.agentId);
          return {
            success: true,
            data: { logs }
          };
        }

        case 'GET_RUNNING_AGENTS': {
          const runningIds = getRunningAgents();
          return {
            success: true,
            data: { agentIds: runningIds }
          };
        }

        case 'UPDATE_AGENT_RUNNER_CONFIG': {
          const { agentId, config } = message.payload as {
            agentId: string;
            config: Partial<ExecutionConfig>;
          };
          const updateResult = updateAgentRunnerConfig(agentId, config);
          return {
            success: updateResult.success,
            error: updateResult.error
          };
        }

        case 'GET_CURRENT_PRICE': {
          const { asset, quote } = message.payload as { asset: string; quote?: string };
          const price = await getCurrentPrice(asset, quote);
          return {
            success: true,
            data: { price, asset, quote: quote || 'USDC' }
          };
        }

        case 'GET_DEFAULT_AGENT_CONFIG': {
          return {
            success: true,
            data: { config: getDefaultConfig() }
          };
        }

        case 'GET_STRATEGY_TEMPLATES': {
          const templates = getStrategyTemplates();
          return {
            success: true,
            data: { templates }
          };
        }

        case 'CREATE_AGENT_FROM_TEMPLATE': {
          const { templateId, customizations } = message.payload as {
            templateId: string;
            customizations?: {
              name?: string;
              description?: string;
              parameterOverrides?: Record<string, Record<string, any>>;
              configOverrides?: Partial<ExecutionConfig>;
            };
          };
          const agent = createAgentFromTemplate(templateId, customizations);
          if (agent) {
            return { success: true, data: { agent } };
          }
          return { success: false, error: 'Template not found' };
        }

        case 'START_MOCK_DEMO': {
          const { templateId, customizations } = message.payload as {
            templateId: string;
            customizations?: {
              targetPrice?: number;
              asset?: string;
              amount?: string;
            };
          };
          const demoResult = await startMockDemo(templateId, customizations);
          return {
            success: demoResult.success,
            error: demoResult.error,
            data: demoResult.agentId ? { agentId: demoResult.agentId } : undefined
          };
        }

        case 'SET_GLOBAL_AGENT_CONFIG': {
          const { config } = message.payload as { config: Partial<ExecutionConfig> };
          setGlobalConfig(config);
          return { success: true };
        }

        case 'GET_MAINNET_PRICE': {
          const { asset } = message.payload as { asset: string };
          const price = await getMainnetAssetPrice(asset);
          return {
            success: true,
            data: { price, asset, source: 'coingecko' }
          };
        }

        // ============ Payment Request Commands ============

        case 'CREATE_PAYMENT_REQUEST': {
          const { requestedFrom, amount, memo, expiresAt } = message.payload as {
            requestedFrom: string;
            amount: string;
            memo?: string;
            expiresAt?: number;
          };

          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'Wallet not found' };
          }

          const request = await createPaymentRequest({
            createdBy: wallet.stellarPublicKey,
            requestedFrom,
            amount,
            memo,
            ...(expiresAt !== undefined ? { expiresAt } : {})
          });

          // Log activity for the creator
          await addActivityEntry({
            type: 'payment_request',
            status: 'pending',
            timestamp: Date.now(),
            requestId: request.id,
            requestedFrom,
            amount,
            memo
          });

          return { success: true, data: { request } };
        }

        case 'GET_PAYMENT_REQUESTS': {
          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'Wallet not found' };
          }

          const requests = await getPaymentRequestsForAddress(wallet.stellarPublicKey);
          return { success: true, data: requests };
        }

        case 'RESPOND_TO_PAYMENT_REQUEST': {
          const { requestId, action } = message.payload as {
            requestId: string;
            action: 'accept' | 'reject';
          };

          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'Wallet not found' };
          }

          const request = await getPaymentRequest(requestId);
          if (!request) {
            return { success: false, error: 'Request not found' };
          }

          if (request.requestedFrom !== wallet.stellarPublicKey) {
            return { success: false, error: 'Not authorized to respond to this request' };
          }

          if (action === 'accept') {
            // Build and submit payment transaction
            try {
              const txResult = await buildPaymentTransaction(
                wallet.stellarPublicKey,
                request.createdBy,
                request.amount,
                request.memo
              );

              // Sign and submit (reuse existing signing logic)
              const sphincs = await getSphincsModule();
              const secretKey = Uint8Array.from(atob(wallet.sphincsSecretKey), c => c.charCodeAt(0));
              const message = new TextEncoder().encode(txResult.xdr);
              const signature = await sphincs.sign(message, secretKey);

              const response = await fetch(`${RELAYER_URL}/api/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  xdr: txResult.xdr,
                  sphincsSignature: uint8ArrayToBase64(signature),
                  sphincsPublicKey: wallet.sphincsPublicKey,
                }),
              });

              const result = await response.json();

              if (!response.ok || !result.success) {
                return { success: false, error: result.error || 'Payment failed' };
              }

              // Update request status
              await updatePaymentRequest(requestId, { status: 'accepted', txHash: result.hash });

              // Log activity for both parties
              await addActivityEntry({
                type: 'payment_request',
                status: 'accepted',
                timestamp: Date.now(),
                requestId,
                txHash: result.hash,
                amount: request.amount,
                memo: request.memo,
                requestedBy: request.createdBy
              });

              return { success: true, data: { txHash: result.hash } };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : 'Payment failed' };
            }
          } else {
            // Reject the request
            await updatePaymentRequest(requestId, { status: 'rejected' });

            await addActivityEntry({
              type: 'payment_request',
              status: 'rejected',
              timestamp: Date.now(),
              requestId,
              amount: request.amount,
              requestedBy: request.createdBy
            });

            return { success: true };
          }
        }

        case 'CANCEL_PAYMENT_REQUEST': {
          const { requestId } = message.payload as { requestId: string };

          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'Wallet not found' };
          }

          const request = await getPaymentRequest(requestId);
          if (!request) {
            return { success: false, error: 'Request not found' };
          }

          if (request.createdBy !== wallet.stellarPublicKey) {
            return { success: false, error: 'Not authorized to cancel this request' };
          }

          await cancelPaymentRequest(requestId, wallet.stellarPublicKey);

          await addActivityEntry({
            type: 'payment_request',
            status: 'expired',  // Use 'expired' as that's what cancelPaymentRequest sets
            timestamp: Date.now(),
            requestId,
            amount: request.amount
          });

          return { success: true };
        }

        // ============ Multi-Send Commands ============

        case 'EXECUTE_MULTI_SEND': {
          const { recipients, memo } = message.payload as {
            recipients: Array<{ address: string; amount: string }>;
            memo?: string;
          };

          const wallet = await loadWallet();
          if (!wallet) {
            return { success: false, error: 'Wallet not found' };
          }

          // Check if wallet is locked (quantum-safe mode)
          if (!wallet.isLocked) {
            return { success: false, error: 'Wallet must be locked for quantum-safe transactions' };
          }

          if (!recipients || recipients.length === 0) {
            return { success: false, error: 'No recipients provided' };
          }

          try {
            // Get SPHINCS+ public key for memo hash (first 32 bytes)
            const sphincsPublicKey = base64ToUint8Array(wallet.sphincsPublicKey);
            const sphincsPublicKey32 = sphincsPublicKey.slice(0, 32);

            console.log('[MultiSend] Building quantum-safe transaction...');
            console.log('[MultiSend] Recipients:', recipients.length);

            // Build with SPHINCS+ public key in memo hash and sequence offset for relayer
            const txResult = await buildMultiSendTransaction(
              wallet.stellarPublicKey,
              recipients,
              sphincsPublicKey32,  // Pass first 32 bytes of SPHINCS+ public key as memo
              1,  // sequence offset for relayer flow
              'hash'  // Use hash memo type
            );

            console.log('[MultiSend] Transaction hash:', txResult.hash);

            // Sign and submit using same pattern as sendXLM
            const sphincs = await getSphincsModule();
            const sphincsSecretKey = base64ToUint8Array(wallet.sphincsSecretKey);
            const hashBytes = hexToUint8Array(txResult.hash);
            const signature = await sphincs.sign(hashBytes, sphincsSecretKey);
            console.log('[MultiSend] Signature size:', signature.length, 'bytes');

            console.log('[MultiSend] Submitting to relayer...');
            const response = await fetch(`${RELAYER_URL}/api/verify-and-submit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                stellarAddress: wallet.stellarPublicKey,
                txHash: txResult.hash,
                txXdr: txResult.xdr,
                sphincsSignature: uint8ArrayToBase64(signature),
              }),
            });

            const result = await response.json();
            console.log('[MultiSend] Relayer response:', result);

            if (!result.success) {
              return { success: false, error: result.error || 'Multi-send failed' };
            }

            const txHash = result.paymentTxHash || result.approvalTxHash || txResult.hash;

            // Log activity
            await addActivityEntry({
              type: 'multi_send',
              status: 'completed',
              timestamp: Date.now(),
              txHash: txHash,
              amount: recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0).toString(),
              recipients: recipients,
              memo
            });

            return { success: true, data: { txHash: txHash } };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Multi-send failed' };
          }
        }

        // ============ Multiwallet Send Commands ============

        case 'EXECUTE_MULTIWALLET_SEND': {
          const { sourceWalletIds, recipients, memo } = message.payload as MultiwalletSendRequest;

          if (!sourceWalletIds || sourceWalletIds.length === 0) {
            return { success: false, error: 'No source wallets specified' };
          }

          if (!recipients || recipients.length === 0) {
            return { success: false, error: 'No recipients provided' };
          }

          // Load all source wallets
          const wallets = await getWalletsByIds(sourceWalletIds);

          if (wallets.length === 0) {
            return { success: false, error: 'No valid source wallets found' };
          }

          if (wallets.length !== sourceWalletIds.length) {
            return { success: false, error: `Only found ${wallets.length} of ${sourceWalletIds.length} specified wallets` };
          }

          // Calculate amount per wallet (equal distribution)
          const totalAmount = recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0);
          const amountPerWallet = totalAmount / wallets.length;

          // Create recipients list for each wallet with divided amounts
          const recipientsPerWallet = recipients.map(r => ({
            address: r.address,
            amount: (parseFloat(r.amount) / wallets.length).toFixed(7)
          }));

          const results: MultiwalletSendResult[] = [];

          // Execute from each wallet in parallel
          const promises = wallets.map(async (wallet) => {
            try {
              // Check if wallet is locked
              if (!wallet.isLocked) {
                return {
                  walletId: wallet.id,
                  walletName: wallet.name,
                  walletAddress: wallet.stellarPublicKey,
                  success: false,
                  error: 'Wallet must be locked for quantum-safe transactions',
                  amountSent: '0',
                  recipientCount: 0
                };
              }

              // Build multi-send transaction for this wallet
              const txResult = await buildMultiSendTransaction(
                wallet.stellarPublicKey,
                recipientsPerWallet,
                memo
              );

              // Sign and submit
              const sphincs = await getSphincsModule();
              const secretKey = Uint8Array.from(atob(wallet.sphincsSecretKey), c => c.charCodeAt(0));
              const messageBytes = new TextEncoder().encode(txResult.xdr);
              const signature = await sphincs.sign(messageBytes, secretKey);

              const response = await fetch(`${RELAYER_URL}/api/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  xdr: txResult.xdr,
                  sphincsSignature: uint8ArrayToBase64(signature),
                  sphincsPublicKey: wallet.sphincsPublicKey,
                }),
              });

              const result = await response.json();

              if (!response.ok || !result.success) {
                return {
                  walletId: wallet.id,
                  walletName: wallet.name,
                  walletAddress: wallet.stellarPublicKey,
                  success: false,
                  error: result.error || 'Transaction failed',
                  amountSent: '0',
                  recipientCount: 0
                };
              }

              return {
                walletId: wallet.id,
                walletName: wallet.name,
                walletAddress: wallet.stellarPublicKey,
                success: true,
                txHash: result.hash,
                amountSent: (amountPerWallet).toFixed(7),
                recipientCount: recipientsPerWallet.length
              };
            } catch (error) {
              return {
                walletId: wallet.id,
                walletName: wallet.name,
                walletAddress: wallet.stellarPublicKey,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                amountSent: '0',
                recipientCount: 0
              };
            }
          });

          const allResults = await Promise.all(promises);

          // Log activity for successful transactions
          const successfulResults = allResults.filter(r => r.success);
          if (successfulResults.length > 0) {
            await addActivityEntry({
              type: 'multi_send',
              status: 'completed',
              timestamp: Date.now(),
              amount: successfulResults.reduce((sum, r) => sum + parseFloat(r.amountSent), 0).toString(),
              recipients: recipients,
              memo: memo || `Multiwallet send from ${successfulResults.length} wallets`
            });
          }

          const allSuccess = allResults.every(r => r.success);
          const anySuccess = allResults.some(r => r.success);

          return {
            success: anySuccess,
            data: {
              results: allResults,
              summary: {
                totalWallets: wallets.length,
                successfulWallets: successfulResults.length,
                failedWallets: wallets.length - successfulResults.length,
                totalAmountSent: successfulResults.reduce((sum, r) => sum + parseFloat(r.amountSent), 0).toString(),
                allSuccess
              }
            },
            error: allSuccess ? undefined : `${wallets.length - successfulResults.length} wallet(s) failed`
          };
        }

        // ============ Webhook Commands ============

        case 'REGISTER_WEBHOOK': {
          const { url, events, headers } = message.payload as {
            url: string;
            events: ('trigger_fired' | 'action_executed' | 'payment_request' | 'error')[];
            headers?: Record<string, string>;
          };

          if (!url || !events || events.length === 0) {
            return { success: false, error: 'URL and events are required' };
          }

          const webhook = await registerWebhook({ url, events, headers, enabled: true });
          return { success: true, data: { webhook } };
        }

        case 'GET_WEBHOOKS': {
          const webhooks = await loadWebhooks();
          return { success: true, data: { webhooks } };
        }

        case 'DELETE_WEBHOOK': {
          const { webhookId } = message.payload as { webhookId: string };
          await deleteWebhook(webhookId);
          return { success: true };
        }

        case 'TEST_WEBHOOK': {
          const { url, headers } = message.payload as {
            url: string;
            headers?: Record<string, string>;
          };

          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...headers
              },
              body: JSON.stringify({
                event: 'test',
                data: { message: 'Test webhook from Nebula Wallet' },
                timestamp: new Date().toISOString()
              })
            });

            return {
              success: response.ok,
              data: { status: response.status, statusText: response.statusText }
            };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Webhook test failed' };
          }
        }

        default:
          return { success: false, error: 'Unknown message type' };
      }
    };

    handleMessage().then(sendResponse);
    return true;
  }
);

// Initialize X402 agent and alarm handlers
setupAlarmHandler();
initializeAgent().catch(console.error);

// Initialize Agent Runner
initializeAgentRunner().catch(console.error);

// Initialize NetworkManager
getNetworkManager().initialize().catch(console.error);

console.log('Nebula Wallet background service worker started');
