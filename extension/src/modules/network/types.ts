/**
 * Network Layer Types
 * Defines configurations and interfaces for Stellar network management
 */

export enum NetworkType {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}

export interface NetworkConfig {
  /** Network identifier */
  type: NetworkType;
  /** Display name for UI */
  name: string;
  /** Horizon API endpoint */
  horizonUrl: string;
  /** Soroban RPC endpoint (for smart contracts) */
  sorobanRpcUrl: string;
  /** Network passphrase for transaction signing */
  passphrase: string;
  /** Default base fee in stroops */
  defaultBaseFee: number;
  /** Maximum fee willing to pay in stroops */
  maxFee: number;
  /** Friendbot URL for testnet faucet (null for mainnet) */
  friendbotUrl: string | null;
  /** Block explorer URL */
  explorerUrl: string;
  /** Whether this is a test network */
  isTestNetwork: boolean;
}

export interface NetworkState {
  /** Currently active network */
  current: NetworkType;
  /** Whether network is reachable */
  isConnected: boolean;
  /** Last successful connection timestamp */
  lastConnectedAt: number | null;
  /** Current network latency in ms */
  latencyMs: number | null;
}

export interface FeeStats {
  /** Minimum fee from recent ledgers */
  min: number;
  /** Average fee from recent ledgers */
  average: number;
  /** Maximum fee from recent ledgers */
  max: number;
  /** Recommended fee for fast inclusion */
  recommended: number;
  /** Timestamp when stats were fetched */
  fetchedAt: number;
}
