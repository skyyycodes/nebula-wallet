/**
 * Execution Module Types
 * Data models for swap and payment execution
 */

import { Quote, SwapResult, AssetId } from '../dex/types';
import { TransactionResult } from '../wallet/types';

/**
 * Execution mode for swaps
 */
export enum ExecutionMode {
  /** Execute immediately */
  IMMEDIATE = 'immediate',
  /** Build transaction only, don't submit */
  BUILD_ONLY = 'build_only',
  /** Simulate execution (dry run) */
  SIMULATE = 'simulate',
}

/**
 * Swap execution request
 */
export interface SwapExecutionRequest {
  /** Quote to execute */
  quote: Quote;
  /** User's public key */
  userPublicKey: string;
  /** User's secret key for signing */
  secretKey: string;
  /** Execution mode */
  mode: ExecutionMode;
  /** Override slippage tolerance */
  slippageTolerance?: number;
  /** Memo to attach */
  memo?: string;
  /** Deadline timestamp (transaction expires after this) */
  deadline?: number;
}

/**
 * Payment execution request
 */
export interface PaymentExecutionRequest {
  /** Source account public key */
  sourcePublicKey: string;
  /** Source account secret key */
  secretKey: string;
  /** Destination account */
  destination: string;
  /** Asset to send */
  asset: AssetId;
  /** Amount to send */
  amount: string;
  /** Memo */
  memo?: string;
  /** Execution mode */
  mode: ExecutionMode;
}

/**
 * Execution status
 */
export enum ExecutionStatus {
  PENDING = 'pending',
  BUILDING = 'building',
  SIGNING = 'signing',
  SUBMITTING = 'submitting',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

/**
 * Execution progress callback
 */
export type ExecutionProgressCallback = (status: ExecutionStatus, details?: string) => void;

/**
 * Execution options
 */
export interface ExecutionOptions {
  /** Progress callback */
  onProgress?: ExecutionProgressCallback;
  /** Use dynamic fee estimation */
  useDynamicFee?: boolean;
  /** Maximum fee willing to pay (in stroops) */
  maxFee?: number;
  /** Timeout for transaction in seconds */
  timeout?: number;
}

/**
 * X402 payment execution request
 * For micropayment protocol compatibility
 */
export interface X402PaymentRequest {
  /** Destination public key */
  destination: string;
  /** Amount in XLM */
  amount: string;
  /** Payment reference/memo */
  reference: string;
  /** X402 specific: Resource being paid for */
  resource?: string;
  /** X402 specific: Request ID */
  requestId?: string;
}

/**
 * X402 payment result
 */
export interface X402PaymentResult extends TransactionResult {
  /** X402 receipt for verification */
  receipt?: {
    timestamp: number;
    destination: string;
    amount: string;
    reference: string;
    hash: string;
  };
}
