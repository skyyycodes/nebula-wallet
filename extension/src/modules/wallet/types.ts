/**
 * Wallet Module Types
 * Data models for account management and transactions
 */

import { Asset } from '@stellar/stellar-sdk';

/**
 * Represents a balance entry for an asset
 */
export interface AssetBalance {
  /** Asset type: 'native', 'credit_alphanum4', 'credit_alphanum12', 'liquidity_pool_shares' */
  assetType: string;
  /** Asset code (e.g., 'XLM', 'USDC') */
  assetCode: string;
  /** Asset issuer public key (null for native XLM) */
  assetIssuer: string | null;
  /** Current balance amount */
  balance: string;
  /** Balance as a number for calculations */
  balanceNumber: number;
  /** Buying liabilities (reserved for offers) */
  buyingLiabilities: string;
  /** Selling liabilities (reserved for offers) */
  sellingLiabilities: string;
  /** Available balance (balance - selling liabilities) */
  availableBalance: string;
  /** Trustline limit (null for native) */
  limit: string | null;
  /** Whether the trustline is authorized */
  isAuthorized: boolean;
  /** Sponsoring account if sponsored */
  sponsor: string | null;
}

/**
 * Full account information
 */
export interface AccountInfo {
  /** Account public key */
  publicKey: string;
  /** Current sequence number */
  sequence: string;
  /** Account balances for all assets */
  balances: AssetBalance[];
  /** Number of subentries (trustlines, offers, data entries, signers) */
  subentryCount: number;
  /** Minimum balance required (in XLM) */
  minimumBalance: string;
  /** Available XLM for spending */
  availableXlm: string;
  /** Whether account exists on network */
  isActive: boolean;
  /** Account thresholds */
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  /** Account flags */
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
    authClawbackEnabled: boolean;
  };
  /** Home domain if set */
  homeDomain: string | null;
  /** Inflation destination if set */
  inflationDestination: string | null;
  /** Last modified ledger */
  lastModifiedLedger: number;
  /** Sponsoring account if sponsored */
  sponsor: string | null;
  /** Number of sponsored reserves */
  numSponsored: number;
  /** Number of sponsoring reserves */
  numSponsoring: number;
}

/**
 * Transaction result after submission
 */
export interface TransactionResult {
  /** Whether transaction was successful */
  success: boolean;
  /** Transaction hash */
  hash: string;
  /** Ledger number where transaction was included */
  ledger: number;
  /** Result XDR */
  resultXdr: string;
  /** Fee charged in stroops */
  feeCharged: string;
  /** Error code if failed */
  errorCode?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Operation results */
  operationResults?: OperationResult[];
}

/**
 * Individual operation result
 */
export interface OperationResult {
  /** Operation index */
  index: number;
  /** Whether operation succeeded */
  success: boolean;
  /** Operation type */
  type: string;
  /** Result details */
  details?: Record<string, unknown>;
}

/**
 * Transaction build options
 */
export interface TransactionBuildOptions {
  /** Source account public key */
  sourceAccount: string;
  /** Fee in stroops (if not using dynamic fee) */
  fee?: number;
  /** Use dynamic fee estimation */
  useDynamicFee?: boolean;
  /** Memo type and value */
  memo?: {
    type: 'text' | 'id' | 'hash' | 'return';
    value: string;
  };
  /** Transaction timeout in seconds */
  timeout?: number;
  /** Time bounds */
  timeBounds?: {
    minTime: number;
    maxTime: number;
  };
}

/**
 * Payment operation parameters
 */
export interface PaymentParams {
  /** Destination account */
  destination: string;
  /** Asset to send */
  asset: Asset;
  /** Amount to send */
  amount: string;
}

/**
 * Path payment parameters (for swaps)
 */
export interface PathPaymentParams {
  /** Send asset */
  sendAsset: Asset;
  /** Maximum amount to send */
  sendMax: string;
  /** Destination account */
  destination: string;
  /** Destination asset */
  destAsset: Asset;
  /** Minimum destination amount */
  destMin: string;
  /** Path of intermediate assets */
  path: Asset[];
}

/**
 * Trustline operation parameters
 */
export interface TrustlineParams {
  /** Asset to trust */
  asset: Asset;
  /** Trustline limit (optional, defaults to max) */
  limit?: string;
}

/**
 * Account creation state
 */
export interface AccountCreationResult {
  /** The generated keypair's public key */
  publicKey: string;
  /** The generated secret key (should be encrypted/secured) */
  secretKey: string;
  /** Mnemonic phrase if generated */
  mnemonic?: string;
  /** Whether account needs funding */
  needsFunding: boolean;
}
