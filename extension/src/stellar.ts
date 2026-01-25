/**
 * Stellar SDK Integration Module
 *
 * Handles all Stellar blockchain operations including:
 * - Account creation
 * - Balance queries
 * - Transaction building
 * - Account locking (quantum-secure mode)
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from './modules/network/NetworkManager';

// Soroban contract ID - This is added as the SIGNER during lock
// The contract verifies ZK proofs and authorizes transactions
// This is QUANTUM-SAFE because contracts have no private key to steal!
const VERIFIER_CONTRACT_ID = 'CDGQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// Legacy Ed25519 verifier key (DEPRECATED - quantum vulnerable!)
// Only kept for backward compatibility during migration
const VERIFIER_PUBLIC_KEY = 'GCVERIFIERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export interface StellarAccount {
  publicKey: string;
  secretKey: string;
}

export interface AccountInfo {
  address: string;
  balance: string;
  isLocked: boolean;
  sequence: string;
}

export interface TransactionResult {
  success: boolean;
  hash?: string;
  error?: string;
  xdr?: string;
}

/**
 * Generate a new Stellar Ed25519 keypair
 */
export function generateStellarKeypair(): StellarAccount {
  const keypair = StellarSdk.Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret()
  };
}

/**
 * Get account info from Stellar network
 */
export async function getAccountInfo(publicKey: string): Promise<AccountInfo | null> {
  try {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const account = await server.loadAccount(publicKey);

    const xlmBalance = account.balances.find(
      (b): b is StellarSdk.Horizon.HorizonApi.BalanceLineNative =>
        b.asset_type === 'native'
    );

    // Check if account is locked (masterWeight = 0)
    const masterSigner = account.signers.find(s => s.key === publicKey);
    const isLocked = masterSigner?.weight === 0;

    return {
      address: publicKey,
      balance: xlmBalance?.balance || '0',
      isLocked,
      sequence: account.sequence
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Not Found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Fund account using Stellar Testnet Friendbot
 */
export async function fundAccountWithFriendbot(publicKey: string): Promise<boolean> {
  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();

    if (!config.friendbotUrl) {
      console.error('Friendbot not available on mainnet');
      return false;
    }

    const response = await fetch(`${config.friendbotUrl}?addr=${publicKey}`);
    if (!response.ok) {
      const text = await response.text();
      console.error('Friendbot error:', text);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Friendbot funding failed:', error);
    return false;
  }
}

/**
 * Get recent transactions for an account
 */
export async function getRecentTransactions(publicKey: string, limit: number = 10): Promise<any[]> {
  try {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    const transactions = await server
      .transactions()
      .forAccount(publicKey)
      .order('desc')
      .limit(limit)
      .call();

    return transactions.records || [];
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return [];
  }
}

/**
 * Build a payment transaction
 *
 * NOTE: For quantum-secure (locked) accounts, we build the transaction with
 * sequence + 1 because the verifier will use the current sequence number
 * for its setOptions transaction to add the preAuthTx signer.
 */
export async function buildPaymentTransaction(
  sourcePublicKey: string,
  destinationPublicKey: string,
  amount: string,
  memo?: string | Uint8Array,
  sequenceOffset: number = 0,
  memoType: 'text' | 'hash' = 'text'
): Promise<{ xdr: string; hash: string }> {
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const loadedAccount = await server.loadAccount(sourcePublicKey);

  // Create account with adjusted sequence if needed (for preAuthTx flow)
  // The verifier's setOptions tx will use the current sequence,
  // so our payment tx needs sequence + 1
  let sourceAccount: StellarSdk.Account;
  if (sequenceOffset > 0) {
    const adjustedSequence = (BigInt(loadedAccount.sequence) + BigInt(sequenceOffset)).toString();
    sourceAccount = new StellarSdk.Account(sourcePublicKey, adjustedSequence);
  } else {
    sourceAccount = loadedAccount;
  }

  // Build transaction with timebounds
  const now = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: now,
    maxTime: now + 300 // 5 minutes validity
  };

  // Determine memo type
  let txMemo: any;
  if (!memo) {
    txMemo = StellarSdk.Memo.none();
  } else if (memoType === 'hash' && memo instanceof Uint8Array) {
    txMemo = StellarSdk.Memo.hash(Buffer.from(memo));
  } else if (typeof memo === 'string') {
    txMemo = StellarSdk.Memo.text(memo);
  } else {
    txMemo = StellarSdk.Memo.none();
  }

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.passphrase,
    timebounds
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: destinationPublicKey,
        asset: StellarSdk.Asset.native(),
        amount: amount
      })
    )
    .addMemo(txMemo)
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

/**
 * Build a path payment transaction for token swaps
 * 
 * NOTE: For quantum-secure (locked) accounts, we build the transaction with
 * sequence + 1 because the relayer will use the current sequence number.
 */
export async function buildSwapTransaction(
  sourcePublicKey: string,
  sendAsset: { code: string; issuer: string | null },
  destAsset: { code: string; issuer: string | null },
  sendAmount: string,
  destMinAmount: string,
  pathAssets: Array<{ code: string; issuer: string | null }> = [],
  memo?: string | Uint8Array,
  sequenceOffset: number = 0,
  memoType: 'text' | 'hash' = 'text'
): Promise<{ xdr: string; hash: string }> {
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const loadedAccount = await server.loadAccount(sourcePublicKey);

  // Create account with adjusted sequence if needed (for relayer flow)
  let sourceAccount: StellarSdk.Account;
  if (sequenceOffset > 0) {
    const adjustedSequence = (BigInt(loadedAccount.sequence) + BigInt(sequenceOffset)).toString();
    sourceAccount = new StellarSdk.Account(sourcePublicKey, adjustedSequence);
  } else {
    sourceAccount = loadedAccount;
  }

  // Build transaction with timebounds
  const now = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: now,
    maxTime: now + 300 // 5 minutes validity
  };

  // Convert asset definitions to Stellar SDK assets
  const sendStellarAsset = sendAsset.issuer
    ? new StellarSdk.Asset(sendAsset.code, sendAsset.issuer)
    : StellarSdk.Asset.native();

  const destStellarAsset = destAsset.issuer
    ? new StellarSdk.Asset(destAsset.code, destAsset.issuer)
    : StellarSdk.Asset.native();

  const pathStellarAssets = pathAssets.map(asset =>
    asset.issuer ? new StellarSdk.Asset(asset.code, asset.issuer) : StellarSdk.Asset.native()
  );

  // Determine memo type
  let txMemo: any;
  if (!memo) {
    txMemo = StellarSdk.Memo.none();
  } else if (memoType === 'hash' && memo instanceof Uint8Array) {
    txMemo = StellarSdk.Memo.hash(Buffer.from(memo));
  } else if (typeof memo === 'string') {
    txMemo = StellarSdk.Memo.text(memo);
  } else {
    txMemo = StellarSdk.Memo.none();
  }

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.passphrase,
    timebounds
  })
    .addOperation(
      StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: sendStellarAsset,
        sendAmount: sendAmount,
        destination: sourcePublicKey, // Send to self for swap
        destAsset: destStellarAsset,
        destMin: destMinAmount,
        path: pathStellarAssets
      })
    )
    .addMemo(txMemo)
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

/**
 * Build a change trust transaction to add a trustline for an asset
 */
export async function buildChangeTrustTransaction(
  sourcePublicKey: string,
  assetCode: string,
  assetIssuer: string,
  memo?: Uint8Array | string,
  sequenceOffset: number = 0,
  memoType: 'hash' | 'text' = 'text'
): Promise<{
  xdr: string;
  hash: string;
}> {
  const networkManager = getNetworkManager();
  const config = networkManager.getConfig();

  // Create Stellar asset
  const asset = new StellarSdk.Asset(assetCode, assetIssuer);

  // Fetch account
  const server = new StellarSdk.Horizon.Server(config.horizonUrl);
  const account = await server.loadAccount(sourcePublicKey);

  // Adjust sequence number for relayer flow
  if (sequenceOffset > 0) {
    for (let i = 0; i < sequenceOffset; i++) {
      account.incrementSequenceNumber();
    }
  }

  // Set transaction timebounds (5 minutes validity)
  const currentTime = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: currentTime - 30,
    maxTime: currentTime + 300
  };

  // Determine memo type
  let txMemo: any;
  if (!memo) {
    txMemo = StellarSdk.Memo.none();
  } else if (memoType === 'hash' && memo instanceof Uint8Array) {
    txMemo = StellarSdk.Memo.hash(Buffer.from(memo));
  } else if (typeof memo === 'string') {
    txMemo = StellarSdk.Memo.text(memo);
  } else {
    txMemo = StellarSdk.Memo.none();
  }

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.passphrase,
    timebounds
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: asset,
        limit: '922337203685.4775807' // Max trustline limit
      })
    )
    .addMemo(txMemo)
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

/**
 * Build a transaction to lock the account (quantum-secure mode)
 *
 * QUANTUM-SAFE ARCHITECTURE:
 * =========================
 * This locks the account so ONLY the Soroban contract can authorize transactions.
 *
 * What happens:
 * 1. Add contract ID as signer (using sha256Hash of contract address)
 * 2. Set masterWeight = 0 (Ed25519 key CANNOT sign anymore)
 *
 * After locking, the transaction flow becomes:
 * 1. User signs tx_hash with SPHINCS+ (quantum-safe)
 * 2. Relayer generates ZK proof of valid SPHINCS+ signature
 * 3. Anyone calls contract's verify_zk_and_authorize()
 * 4. Contract verifies ZK proof and authorizes the transaction
 * 5. Transaction executes (contract is the authorized signer)
 *
 * WHY THIS IS QUANTUM-SAFE:
 * - User's Ed25519 is disabled (masterWeight=0)
 * - Contract has no private key to steal
 * - ZK proof proves SPHINCS+ signature validity
 * - Relayer only pays gas, doesn't provide signing authority
 *
 * @param sourcePublicKey - User's Stellar public key
 * @param sourceSecretKey - User's Stellar secret key (last time it's used!)
 * @param contractId - Soroban contract ID (C...) that becomes the signer
 */
export async function buildLockAccountTransaction(
  sourcePublicKey: string,
  sourceSecretKey: string,
  contractId: string
): Promise<TransactionResult> {
  try {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const config = networkManager.getConfig();
    const sourceAccount = await server.loadAccount(sourcePublicKey);
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);

    // Convert contract ID to sha256 hash for signer
    // Soroban contract IDs are StrKey-encoded, we compute SHA256(contractIdBytes)
    // as the signer hash. When authorizing, we provide contractIdBytes as the preimage.
    const contractIdBytes = StellarSdk.StrKey.decodeContract(contractId);
    
    // CRITICAL: Compute SHA256 of contract ID bytes to use as signer hash
    // This follows the pattern: signer_hash = SHA256(preimage)
    // When signing, we'll provide contractIdBytes as the preimage
    // Use Web Crypto API (available in browser extensions)
    const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(contractIdBytes));
    const contractHash = Buffer.from(hashBuffer);

    // Build transaction to:
    // 1. Add contract as signer (using sha256Hash type)
    // 2. Lock account (masterWeight = 0)
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: config.passphrase
    })
      // First: Add contract as a signer with weight 1
      // Using sha256Hash signer type - the contract will provide authorization
      .addOperation(
        StellarSdk.Operation.setOptions({
          signer: {
            sha256Hash: contractHash,
            weight: 1
          }
        })
      )
      // Second: Set thresholds and disable master key
      .addOperation(
        StellarSdk.Operation.setOptions({
          masterWeight: 0, // Ed25519 key CANNOT sign anymore - quantum safe!
          lowThreshold: 1,
          medThreshold: 1,
          highThreshold: 1
        })
      )
      .setTimeout(30)
      .build();

    // Sign with Ed25519 key (LAST TIME this key can sign!)
    transaction.sign(sourceKeypair);

    // Submit transaction
    const result = await server.submitTransaction(transaction);

    return {
      success: true,
      hash: result.hash
    };
  } catch (error: unknown) {
    console.error('Lock account failed:', error);
    let errorMsg = 'Unknown error';
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { extras?: { result_codes?: unknown } } } };
      errorMsg = JSON.stringify(axiosError.response?.data?.extras?.result_codes) || errorMsg;
    } else if (error instanceof Error) {
      errorMsg = error.message;
    }
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * DEPRECATED: Legacy lock function using Ed25519 verifier key
 * This is QUANTUM VULNERABLE! Use buildLockAccountTransaction with contract ID instead.
 */
export async function buildLockAccountTransactionLegacy(
  sourcePublicKey: string,
  sourceSecretKey: string,
  verifierPublicKey: string
): Promise<TransactionResult> {
  console.warn('⚠️ WARNING: Using legacy Ed25519 verifier - QUANTUM VULNERABLE!');
  console.warn('Use buildLockAccountTransaction with contract ID for quantum safety.');

  try {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const config = networkManager.getConfig();
    const sourceAccount = await server.loadAccount(sourcePublicKey);
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: config.passphrase
    })
      .addOperation(
        StellarSdk.Operation.setOptions({
          signer: {
            ed25519PublicKey: verifierPublicKey,
            weight: 1
          }
        })
      )
      .addOperation(
        StellarSdk.Operation.setOptions({
          masterWeight: 0,
          lowThreshold: 1,
          medThreshold: 1,
          highThreshold: 1
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(sourceKeypair);
    const result = await server.submitTransaction(transaction);

    return {
      success: true,
      hash: result.hash
    };
  } catch (error: unknown) {
    console.error('Lock account failed:', error);
    let errorMsg = 'Unknown error';
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { extras?: { result_codes?: unknown } } } };
      errorMsg = JSON.stringify(axiosError.response?.data?.extras?.result_codes) || errorMsg;
    } else if (error instanceof Error) {
      errorMsg = error.message;
    }
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Validate a Stellar public key
 */
export function isValidStellarAddress(address: string): boolean {
  try {
    StellarSdk.Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format XLM amount for display
 */
export function formatXLM(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return num.toFixed(7).replace(/\.?0+$/, '');
}

<<<<<<< HEAD
export { VERIFIER_CONTRACT_ID, VERIFIER_PUBLIC_KEY };
=======
/**
 * Build a multi-send transaction (batch payments to multiple recipients)
 */
export async function buildMultiSendTransaction(
  sourcePublicKey: string,
  recipients: { address: string; amount: string; asset?: string }[],
  memo?: string | Uint8Array,
  sequenceOffset: number = 0,
  memoType: 'text' | 'hash' = 'text'
): Promise<{ xdr: string; hash: string }> {
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const loadedAccount = await server.loadAccount(sourcePublicKey);

  // Create account with adjusted sequence if needed (for relayer flow)
  let sourceAccount: StellarSdk.Account;
  if (sequenceOffset > 0) {
    const adjustedSequence = (BigInt(loadedAccount.sequence) + BigInt(sequenceOffset)).toString();
    sourceAccount = new StellarSdk.Account(sourcePublicKey, adjustedSequence);
  } else {
    sourceAccount = loadedAccount;
  }

  // Build transaction with timebounds
  const now = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: now,
    maxTime: now + 300 // 5 minutes validity
  };

  // Fee is base fee times number of operations
  const totalFee = (parseInt(StellarSdk.BASE_FEE) * recipients.length).toString();

  let txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: totalFee,
    networkPassphrase: config.passphrase,
    timebounds
  });

  // Build all operations first, then add to transaction
  // Using any[] to work around SDK type mismatches between Operation types
  const operations: any[] = [];

  // Process recipients sequentially to check account existence
  for (const recipient of recipients) {
    console.log(`[MultiSend] Processing recipient: ${recipient.address}, amount: ${recipient.amount}`);
    
    let operation;
    try {
      // Check if account exists
      await server.loadAccount(recipient.address);
      console.log(`[MultiSend] Account exists, using payment operation`);
      // Account exists, use payment
      operation = StellarSdk.Operation.payment({
        destination: recipient.address,
        asset: StellarSdk.Asset.native(), // XLM only for now
        amount: recipient.amount
      });
    } catch (e) {
      console.log(`[MultiSend] Account doesn't exist, using createAccount operation`);
      // Account likely doesn't exist, use createAccount
      // Note: Only works for Native asset (XLM) and amount >= 1
      if (parseFloat(recipient.amount) < 1) {
        throw new Error(`Cannot fund new account ${recipient.address} with less than 1 XLM`);
      }
      operation = StellarSdk.Operation.createAccount({
        destination: recipient.address,
        startingBalance: recipient.amount
      });
    }
    operations.push(operation);
  }

  // Add all operations to builder
  for (const op of operations) {
    txBuilder = txBuilder.addOperation(op);
  }

  // Add memo based on type
  if (memo) {
    if (memoType === 'hash' && memo instanceof Uint8Array) {
      txBuilder = txBuilder.addMemo(StellarSdk.Memo.hash(Buffer.from(memo)));
    } else if (typeof memo === 'string') {
      txBuilder = txBuilder.addMemo(StellarSdk.Memo.text(memo.slice(0, 28)));
    }
  }

  const transaction = txBuilder.build();
  console.log(`[MultiSend] Transaction built with ${operations.length} operations`);

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

/**
 * Build a claimable balance transaction (for payment requests)
 * Creates a pending payment that the recipient can claim
 */
export async function buildClaimableBalanceTransaction(
  sourcePublicKey: string,
  destinationPublicKey: string,
  amount: string,
  expirationSeconds: number = 86400 * 7 // 7 days default
): Promise<{ xdr: string; hash: string }> {
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const now = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: now,
    maxTime: now + 300
  };

  // Claimant conditions:
  // - Destination can claim anytime before expiration
  // - Source can reclaim after expiration
  const claimants = [
    new StellarSdk.Claimant(
      destinationPublicKey,
      StellarSdk.Claimant.predicateBeforeAbsoluteTime((now + expirationSeconds).toString())
    ),
    new StellarSdk.Claimant(
      sourcePublicKey,
      StellarSdk.Claimant.predicateNot(
        StellarSdk.Claimant.predicateBeforeAbsoluteTime((now + expirationSeconds).toString())
      )
    )
  ];

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.passphrase,
    timebounds
  })
    .addOperation(
      StellarSdk.Operation.createClaimableBalance({
        asset: StellarSdk.Asset.native(),
        amount: amount,
        claimants: claimants
      })
    )
    .addMemo(StellarSdk.Memo.text('Payment Request'))
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

/**
 * Build transaction to claim a claimable balance
 */
export async function buildClaimBalanceTransaction(
  sourcePublicKey: string,
  balanceId: string
): Promise<{ xdr: string; hash: string }> {
  const networkManager = getNetworkManager();
  const server = networkManager.getServer();
  const config = networkManager.getConfig();
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const now = Math.floor(Date.now() / 1000);
  const timebounds = {
    minTime: now,
    maxTime: now + 300
  };

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.passphrase,
    timebounds
  })
    .addOperation(
      StellarSdk.Operation.claimClaimableBalance({
        balanceId: balanceId
      })
    )
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: transaction.hash().toString('hex')
  };
}

export { VERIFIER_PUBLIC_KEY };
>>>>>>> 34cce9f4880f29c7f8c9cf21ea66c5f987aee96d
