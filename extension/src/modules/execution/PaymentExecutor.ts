/**
 * Payment Executor
 * Handles simple payment transactions and X402 micropayments
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from '../network';
import { getAccountService, getTransactionBuilder } from '../wallet';
import { AssetId } from '../dex/types';
import {
  PaymentExecutionRequest,
  X402PaymentRequest,
  X402PaymentResult,
  ExecutionMode,
  ExecutionStatus,
  ExecutionOptions,
  ExecutionProgressCallback,
} from './types';
import { TransactionResult } from '../wallet/types';

const DEFAULT_TIMEOUT = 180;

export class PaymentExecutor {
  private static instance: PaymentExecutor | null = null;

  private constructor() {}

  static getInstance(): PaymentExecutor {
    if (!PaymentExecutor.instance) {
      PaymentExecutor.instance = new PaymentExecutor();
    }
    return PaymentExecutor.instance;
  }

  /**
   * Execute a simple payment
   */
  async executePayment(
    request: PaymentExecutionRequest,
    options: ExecutionOptions = {}
  ): Promise<TransactionResult> {
    const { onProgress } = options;

    try {
      this.notifyProgress(onProgress, ExecutionStatus.BUILDING, 'Building payment...');

      // Build transaction
      const transaction = await this.buildPaymentTransaction(request, options);

      if (request.mode === ExecutionMode.BUILD_ONLY) {
        return {
          success: true,
          hash: '',
          ledger: 0,
          resultXdr: '',
          feeCharged: '0',
        };
      }

      // Sign
      this.notifyProgress(onProgress, ExecutionStatus.SIGNING, 'Signing...');
      const keypair = StellarSdk.Keypair.fromSecret(request.secretKey);
      transaction.sign(keypair);

      if (request.mode === ExecutionMode.SIMULATE) {
        return {
          success: true,
          hash: transaction.hash().toString('hex'),
          ledger: 0,
          resultXdr: '',
          feeCharged: transaction.fee.toString(),
        };
      }

      // Submit
      this.notifyProgress(onProgress, ExecutionStatus.SUBMITTING, 'Submitting...');
      const result = await this.submitTransaction(transaction);

      if (result.success) {
        this.notifyProgress(onProgress, ExecutionStatus.CONFIRMED, 'Payment confirmed!');
      } else {
        this.notifyProgress(onProgress, ExecutionStatus.FAILED, result.errorMessage);
      }

      return result;
    } catch (error: any) {
      this.notifyProgress(onProgress, ExecutionStatus.FAILED, error.message);
      return {
        success: false,
        hash: '',
        ledger: 0,
        resultXdr: '',
        feeCharged: '0',
        errorMessage: error.message,
      };
    }
  }

  /**
   * Execute an X402 micropayment
   * Compatible with the X402 protocol for web resource payments
   */
  async executeX402Payment(
    sourcePublicKey: string,
    secretKey: string,
    request: X402PaymentRequest,
    options: ExecutionOptions = {}
  ): Promise<X402PaymentResult> {
    const { onProgress } = options;

    try {
      this.notifyProgress(onProgress, ExecutionStatus.BUILDING, 'Building X402 payment...');

      const networkManager = getNetworkManager();
      const accountService = getAccountService();
      const config = networkManager.getConfig();

      // Load source account
      const sourceAccount = await accountService.loadAccount(sourcePublicKey);

      // Determine fee
      let fee: number;
      if (options.useDynamicFee) {
        fee = await networkManager.getRecommendedFee();
      } else {
        fee = config.defaultBaseFee;
      }

      // Build transaction
      const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: fee.toString(),
        networkPassphrase: config.passphrase,
      });

      // Add payment operation
      builder.addOperation(
        StellarSdk.Operation.payment({
          destination: request.destination,
          asset: StellarSdk.Asset.native(),
          amount: request.amount,
        })
      );

      // Add X402 reference as memo
      const memoText = request.requestId 
        ? `X402:${request.requestId}`
        : `X402:${request.reference.slice(0, 24)}`;
      builder.addMemo(StellarSdk.Memo.text(memoText));

      builder.setTimeout(options.timeout ?? DEFAULT_TIMEOUT);
      const transaction = builder.build();

      // Sign
      this.notifyProgress(onProgress, ExecutionStatus.SIGNING, 'Signing X402 payment...');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      transaction.sign(keypair);

      // Submit
      this.notifyProgress(onProgress, ExecutionStatus.SUBMITTING, 'Submitting X402 payment...');
      const result = await this.submitTransaction(transaction);

      if (result.success) {
        this.notifyProgress(onProgress, ExecutionStatus.CONFIRMED, 'X402 payment confirmed!');
        
        return {
          ...result,
          receipt: {
            timestamp: Date.now(),
            destination: request.destination,
            amount: request.amount,
            reference: request.reference,
            hash: result.hash,
          },
        };
      }

      return {
        ...result,
        receipt: undefined,
      };
    } catch (error: any) {
      this.notifyProgress(onProgress, ExecutionStatus.FAILED, error.message);
      return {
        success: false,
        hash: '',
        ledger: 0,
        resultXdr: '',
        feeCharged: '0',
        errorMessage: error.message,
      };
    }
  }

  /**
   * Batch multiple X402 payments into a single transaction
   */
  async executeBatchX402Payments(
    sourcePublicKey: string,
    secretKey: string,
    payments: X402PaymentRequest[],
    options: ExecutionOptions = {}
  ): Promise<X402PaymentResult> {
    if (payments.length === 0) {
      throw new Error('No payments to execute');
    }
    if (payments.length > 100) {
      throw new Error('Too many payments in batch (max 100)');
    }

    const { onProgress } = options;

    try {
      this.notifyProgress(onProgress, ExecutionStatus.BUILDING, `Building batch of ${payments.length} X402 payments...`);

      const networkManager = getNetworkManager();
      const accountService = getAccountService();
      const config = networkManager.getConfig();

      const sourceAccount = await accountService.loadAccount(sourcePublicKey);

      let fee: number;
      if (options.useDynamicFee) {
        fee = await networkManager.getRecommendedFee(payments.length);
      } else {
        fee = config.defaultBaseFee * payments.length;
      }

      const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: fee.toString(),
        networkPassphrase: config.passphrase,
      });

      // Add all payment operations
      for (const payment of payments) {
        builder.addOperation(
          StellarSdk.Operation.payment({
            destination: payment.destination,
            asset: StellarSdk.Asset.native(),
            amount: payment.amount,
          })
        );
      }

      builder.addMemo(StellarSdk.Memo.text(`X402:batch:${payments.length}`));
      builder.setTimeout(options.timeout ?? DEFAULT_TIMEOUT);
      const transaction = builder.build();

      // Sign
      this.notifyProgress(onProgress, ExecutionStatus.SIGNING, 'Signing batch...');
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);
      transaction.sign(keypair);

      // Submit
      this.notifyProgress(onProgress, ExecutionStatus.SUBMITTING, 'Submitting batch...');
      const result = await this.submitTransaction(transaction);

      if (result.success) {
        this.notifyProgress(onProgress, ExecutionStatus.CONFIRMED, 'Batch confirmed!');
      }

      return {
        ...result,
        receipt: result.success ? {
          timestamp: Date.now(),
          destination: 'batch',
          amount: payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(7),
          reference: `batch:${payments.length}`,
          hash: result.hash,
        } : undefined,
      };
    } catch (error: any) {
      this.notifyProgress(onProgress, ExecutionStatus.FAILED, error.message);
      return {
        success: false,
        hash: '',
        ledger: 0,
        resultXdr: '',
        feeCharged: '0',
        errorMessage: error.message,
      };
    }
  }

  // Private methods

  private async buildPaymentTransaction(
    request: PaymentExecutionRequest,
    options: ExecutionOptions
  ): Promise<StellarSdk.Transaction> {
    const networkManager = getNetworkManager();
    const accountService = getAccountService();
    const config = networkManager.getConfig();

    const sourceAccount = await accountService.loadAccount(request.sourcePublicKey);

    let fee: number;
    if (options.useDynamicFee) {
      fee = await networkManager.getRecommendedFee();
    } else {
      fee = options.maxFee ?? config.defaultBaseFee;
    }

    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: config.passphrase,
    });

    const asset = this.assetIdToAsset(request.asset);

    builder.addOperation(
      StellarSdk.Operation.payment({
        destination: request.destination,
        asset,
        amount: request.amount,
      })
    );

    if (request.memo) {
      builder.addMemo(StellarSdk.Memo.text(request.memo));
    }

    builder.setTimeout(options.timeout ?? DEFAULT_TIMEOUT);
    return builder.build();
  }

  private assetIdToAsset(assetId: AssetId): StellarSdk.Asset {
    if (!assetId.issuer) {
      return StellarSdk.Asset.native();
    }
    return new StellarSdk.Asset(assetId.code, assetId.issuer);
  }

  private async submitTransaction(
    transaction: StellarSdk.Transaction
  ): Promise<TransactionResult> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    try {
      const response = await server.submitTransaction(transaction);
      return {
        success: true,
        hash: response.hash,
        ledger: response.ledger,
        resultXdr: response.result_xdr,
        feeCharged: (response as any).fee_charged?.toString() || '0',
      };
    } catch (error: any) {
      return {
        success: false,
        hash: transaction.hash().toString('hex'),
        ledger: 0,
        resultXdr: '',
        feeCharged: '0',
        errorMessage: this.parseSubmitError(error),
      };
    }
  }

  private parseSubmitError(error: any): string {
    if (error.response?.data?.extras?.result_codes) {
      const codes = error.response.data.extras.result_codes;
      if (codes.operations) {
        const opErrors = codes.operations.filter((c: string) => c !== 'op_success');
        if (opErrors.includes('op_underfunded')) {
          return 'Insufficient balance';
        }
        if (opErrors.includes('op_no_destination')) {
          return 'Destination account does not exist';
        }
        if (opErrors.includes('op_no_trust')) {
          return 'Destination missing trustline for asset';
        }
        return `Payment failed: ${opErrors.join(', ')}`;
      }
      if (codes.transaction) {
        return `Transaction failed: ${codes.transaction}`;
      }
    }
    return error.message || 'Unknown payment error';
  }

  private notifyProgress(
    callback: ExecutionProgressCallback | undefined,
    status: ExecutionStatus,
    details?: string
  ): void {
    if (callback) {
      callback(status, details);
    }
  }
}

// Export singleton getter
export const getPaymentExecutor = () => PaymentExecutor.getInstance();
