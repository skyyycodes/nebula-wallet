/**
 * Type definitions for the Nebula Wallet
 */

// Message types for communication between extension components
export type MessageType =
  | 'PING'
  | 'CREATE_WALLET'
  | 'IMPORT_WALLET'
  | 'GET_WALLET'
  | 'GET_WALLET_KEYS'
  | 'GET_ACCOUNTS'
  | 'SWITCH_ACCOUNT'
  | 'DELETE_ACCOUNT'
  | 'GET_BALANCE'
  | 'GET_BALANCE_FOR_ACCOUNT'
  | 'GET_ACTIVITY_LOG'
  | 'AIRDROP'
  | 'LOCK_WALLET'
  | 'SEND_XLM'
  | 'SWAP_TOKENS'
  | 'ADD_TRUSTLINE'
  | 'CONNECT'
  | 'SIGN_TRANSACTION'
  // Site Connection Message Types
  | 'IS_CONNECTED'
  | 'GET_CONNECTED_SITES'
  | 'DISCONNECT_SITE'
  | 'APPROVAL_RESPONSE'
  | 'GET_NETWORK'
  | 'SET_NETWORK'
  // X402 Message Types
  | 'X402_GET_SPENDING_ACCOUNT'
  | 'X402_CREATE_SPENDING_ACCOUNT'
  | 'X402_FUND_SPENDING_ACCOUNT'
  | 'X402_GET_SPENDING_BALANCE'
  | 'X402_SIGN_PAYMENT'
  | 'X402_GET_SERVICES'
  | 'X402_UPDATE_SERVICE_POLICY'
  | 'X402_DELETE_SERVICE'
  | 'X402_GET_ACTIVITY'
  | 'X402_GET_AGENT_STATUS'
  | 'X402_SET_AGENT_CONFIG'
  | 'X402_REQUEST_RECHARGE'
  // Agent Runner Message Types
  | 'START_AGENT'
  | 'STOP_AGENT'
  | 'GET_AGENT_RUNNER_STATUS'
  | 'GET_EXECUTION_LOGS'
  | 'GET_RUNNING_AGENTS'
  | 'UPDATE_AGENT_RUNNER_CONFIG'
  | 'GET_CURRENT_PRICE'
  | 'GET_DEFAULT_AGENT_CONFIG'
  // Strategy Templates & Mock Execution
  | 'GET_STRATEGY_TEMPLATES'
  | 'CREATE_AGENT_FROM_TEMPLATE'
  | 'START_MOCK_DEMO'
  | 'SET_GLOBAL_AGENT_CONFIG'
  | 'GET_MAINNET_PRICE'
  // Payment Requests
  | 'CREATE_PAYMENT_REQUEST'
  | 'GET_PAYMENT_REQUESTS'
  | 'RESPOND_TO_PAYMENT_REQUEST'
  | 'CANCEL_PAYMENT_REQUEST'
  // Multi-send
  | 'EXECUTE_MULTI_SEND'
  // Multiwallet send (from multiple source wallets)
  | 'EXECUTE_MULTIWALLET_SEND'
  // Webhooks
  | 'REGISTER_WEBHOOK'
  | 'GET_WEBHOOKS'
  | 'DELETE_WEBHOOK'
  | 'TEST_WEBHOOK';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Account info returned to UI
export interface AccountInfo {
  id: string;
  name: string;
  address: string;
  isLocked: boolean;
}

// API types exposed to websites (Provider pattern)
export interface QuantumStellarAPI {
  // Metadata
  readonly isQuantumStellar: boolean;
  readonly version: string;

  // Connection
  isConnected(): boolean;
  getAddress(): string | null;
  connect(): Promise<{ address: string }>;
  disconnect(): Promise<void>;
  getAccounts(): Promise<string[]>;
  checkConnection(): Promise<{ connected: boolean; address: string | null }>;

  // Wallet operations
  getBalance(): Promise<string>;
  sendXLM(to: string, amount: string): Promise<{ txHash: string }>;
  swapTokens(
    sendAsset: { code: string; issuer: string | null },
    destAsset: { code: string; issuer: string | null },
    sendAmount: string,
    destMinAmount: string,
    pathAssets?: Array<{ code: string; issuer: string | null }>
  ): Promise<{ txHash: string }>;

  // Events
  on(event: string, callback: (data: unknown) => void): void;
  off(event: string, callback: (data: unknown) => void): void;
  once(event: string, callback: (data: unknown) => void): void;

  // Generic message sender
  sendMessage(type: string, payload?: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

// Transaction request from website
export interface SendXLMRequest {
  to: string;
  amount: string;
}

// Verifier request/response types
export interface VerifierRequest {
  tx_xdr: string;
  tx_hash: string;
  sphincs_sig: string;
  sphincs_pub: string;
  source_address: string;
}

export interface VerifierResponse {
  success: boolean;
  tx_hash?: string;
  error?: string;
}

// Window type extension for injected API
declare global {
  interface Window {
    quantumStellar?: QuantumStellarAPI;
  }
}

// ============================================
// X402 Protocol Types (Stellar x402 compliant)
// ============================================

/**
 * X402 Payment Requirements (from 402 response)
 * Based on x402-stellar protocol specification
 */
export interface X402PaymentRequirements {
  scheme: 'exact';
  network: 'stellar-testnet' | 'stellar-mainnet' | string;
  maxAmountRequired: string; // In stroops (1 XLM = 10,000,000 stroops)
  resource: string; // The URL being accessed
  payTo: string; // Stellar address to receive payment
  asset: 'native' | string; // 'native' for XLM
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: {
    feeSponsorship?: boolean;
    facilitatorUrl?: string;
  };
}

/**
 * X402 Payment Payload (sent in X-PAYMENT header)
 * XDR-based format for Stellar
 */
export interface X402PaymentPayload {
  signedTxXdr: string; // Complete signed transaction XDR
  sourceAccount: string; // Payer's Stellar address
  destination: string; // Payee's Stellar address
  amount: string; // Amount in stroops
  asset: 'native' | string;
  validUntilLedger?: number;
  nonce: string; // UUID for idempotency
}

/**
 * X402 402 Response body
 */
export interface X402Response {
  x402Version: number;
  accepts: X402PaymentRequirements[];
  error?: string;
}

/**
 * Spending Account (separate Ed25519 keypair for X402)
 */
export interface SpendingAccount {
  publicKey: string;
  secretKey: string;
  createdAt: number;
}

/**
 * Service Policy - per-origin payment permissions
 */
export interface ServicePolicy {
  origin: string;
  name: string;
  permission: 'auto' | 'prompt' | 'deny';
  maxPerTransaction: string; // Max XLM per single payment
  maxPerDay: string; // Max XLM per day
  spentToday: string; // Amount spent today
  lastResetDate: string; // Date string for daily reset
  emailAlerts: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Transaction Activity Log Entry
 */
export interface TransactionActivity {
  id: string;
  accountId?: string;
  type: 'send' | 'receive' | 'payment' | 'swap' | 'payment_request' | 'multi_send';
  origin?: string;
  resource?: string;
  from?: string;
  to?: string;
  amount: string; // XLM
  status: 'pending' | 'completed' | 'failed' | 'accepted' | 'rejected' | 'expired';
  txHash?: string;
  timestamp: number;
  error?: string;
  // Payment request specific fields
  requestId?: string;
  requestedBy?: string;  // Who created the request (their address)
  requestedFrom?: string; // Who should pay (their address)
  memo?: string;
  expiresAt?: number;
  // Multi-send specific
  recipients?: { address: string; amount: string }[];
}

/**
 * Payment Request - for requesting payment from another wallet
 */
export interface PaymentRequest {
  id: string;
  createdBy: string;      // Stellar address of requester
  requestedFrom: string;  // Stellar address of payer
  amount: string;
  memo?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  txHash?: string;        // Filled when accepted
  respondedAt?: number;   // When accepted/rejected
}

/**
 * Webhook Configuration
 */
export interface WebhookConfig {
  id: string;
  url: string;
  events: ('trigger_fired' | 'action_executed' | 'payment_request' | 'error')[];
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}

/**
 * Agent Configuration
 */
export interface AgentConfig {
  enabled: boolean;
  rechargeThreshold: string; // XLM balance to trigger recharge
  rechargeAmount: string; // XLM to recharge
  maxRechargePerDay: string; // Max XLM to recharge per day
  rechargedToday: string;
  lastResetDate: string;
  emailOnLowBalance: boolean;
  emailOnRecharge: boolean;
  alertEmail?: string;
}

/**
 * Agent Status
 */
export interface AgentStatus {
  spendingBalance: string;
  isEnabled: boolean;
  lastCheck: number;
  rechargesToday: number;
  nextCheck?: number;
}

/**
 * Multiwallet Send Request - for sending from multiple source wallets
 */
export interface MultiwalletSendRequest {
  sourceWalletIds: string[];  // Array of wallet IDs to send from
  recipients: {
    address: string;
    amount: string;
  }[];
  memo?: string;
}

/**
 * Multiwallet Send Result - result from each source wallet
 */
export interface MultiwalletSendResult {
  walletId: string;
  walletName: string;
  walletAddress: string;
  success: boolean;
  txHash?: string;
  error?: string;
  amountSent: string;
  recipientCount: number;
}
