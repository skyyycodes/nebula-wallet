/**
 * Transaction Builder
 * Builds, signs, and submits Stellar transactions
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from '../network';
import { getAccountService } from './AccountService';
import {
  TransactionBuildOptions,
  TransactionResult,
  PaymentParams,
  PathPaymentParams,
  TrustlineParams,
} from './types';

const DEFAULT_TIMEOUT = 180; // 3 minutes

export class TransactionBuilder {
  private static instance: TransactionBuilder | null = null;

  private constructor() {}

  static getInstance(): TransactionBuilder {
    if (!TransactionBuilder.instance) {
      TransactionBuilder.instance = new TransactionBuilder();
    }
    return TransactionBuilder.instance;
  }

  /**
   * Build a payment transaction
   */
  async buildPayment(
    params: PaymentParams,
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    builder.addOperation(
      StellarSdk.Operation.payment({
        destination: params.destination,
        asset: params.asset,
        amount: params.amount,
      })
    );

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Build a path payment (swap) transaction
   */
  async buildPathPayment(
    params: PathPaymentParams,
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    builder.addOperation(
      StellarSdk.Operation.pathPaymentStrictReceive({
        sendAsset: params.sendAsset,
        sendMax: params.sendMax,
        destination: params.destination,
        destAsset: params.destAsset,
        destAmount: params.destMin,
        path: params.path,
      })
    );

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Build a path payment strict send transaction
   */
  async buildPathPaymentStrictSend(
    params: {
      sendAsset: StellarSdk.Asset;
      sendAmount: string;
      destination: string;
      destAsset: StellarSdk.Asset;
      destMin: string;
      path: StellarSdk.Asset[];
    },
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    builder.addOperation(
      StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: params.sendAsset,
        sendAmount: params.sendAmount,
        destination: params.destination,
        destAsset: params.destAsset,
        destMin: params.destMin,
        path: params.path,
      })
    );

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Build a change trust (add/remove trustline) transaction
   */
  async buildChangeTrust(
    params: TrustlineParams,
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    builder.addOperation(
      StellarSdk.Operation.changeTrust({
        asset: params.asset,
        limit: params.limit,
      })
    );

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Build a create account transaction
   */
  async buildCreateAccount(
    destination: string,
    startingBalance: string,
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    builder.addOperation(
      StellarSdk.Operation.createAccount({
        destination,
        startingBalance,
      })
    );

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Build a multi-operation transaction
   */
  async buildMultiOp(
    operations: StellarSdk.xdr.Operation[],
    options: TransactionBuildOptions
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.createBuilder(options);

    for (const op of operations) {
      builder.addOperation(op);
    }

    return this.finalizeTransaction(builder, options);
  }

  /**
   * Sign a transaction with a secret key
   */
  signTransaction(
    transaction: StellarSdk.Transaction,
    secretKey: string
  ): StellarSdk.Transaction {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);

    transaction.sign(keypair);
    return transaction;
  }

  /**
   * Submit a signed transaction to the network
   */
  async submitTransaction(
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
      return this.parseTransactionError(error, transaction.hash().toString('hex'));
    }
  }

  /**
   * Sign and submit a transaction
   */
  async signAndSubmit(
    transaction: StellarSdk.Transaction,
    secretKey: string
  ): Promise<TransactionResult> {
    this.signTransaction(transaction, secretKey);
    return this.submitTransaction(transaction);
  }

  /**
   * Estimate fee for a transaction
   */
  async estimateFee(operationCount: number): Promise<number> {
    const networkManager = getNetworkManager();
    return networkManager.getRecommendedFee(operationCount);
  }

  // Private methods

  private async createBuilder(
    options: TransactionBuildOptions
  ): Promise<StellarSdk.TransactionBuilder> {
    const networkManager = getNetworkManager();
    const accountService = getAccountService();
    const config = networkManager.getConfig();

    // Load source account
    const sourceAccount = await accountService.loadAccount(options.sourceAccount);

    // Determine fee
    let fee: number;
    if (options.fee !== undefined) {
      fee = options.fee;
    } else if (options.useDynamicFee) {
      fee = await networkManager.getRecommendedFee();
    } else {
      fee = config.defaultBaseFee;
    }

    // Create builder
    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: config.passphrase,
    });

    return builder;
  }

  private finalizeTransaction(
    builder: StellarSdk.TransactionBuilder,
    options: TransactionBuildOptions
  ): StellarSdk.Transaction {
    // Add memo if provided
    if (options.memo) {
      switch (options.memo.type) {
        case 'text':
          builder.addMemo(StellarSdk.Memo.text(options.memo.value));
          break;
        case 'id':
          builder.addMemo(StellarSdk.Memo.id(options.memo.value));
          break;
        case 'hash':
          builder.addMemo(StellarSdk.Memo.hash(options.memo.value));
          break;
        case 'return':
          builder.addMemo(StellarSdk.Memo.return(options.memo.value));
          break;
      }
    }

    // Set timeout
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    builder.setTimeout(timeout);

    // Build and return
    return builder.build();
  }

  private parseTransactionError(error: any, hash: string): TransactionResult {
    const result: TransactionResult = {
      success: false,
      hash,
      ledger: 0,
      resultXdr: '',
      feeCharged: '0',
    };

    // Parse Horizon error response
    if (error.response?.data?.extras) {
      const extras = error.response.data.extras;
      result.resultXdr = extras.result_xdr || '';
      result.errorCode = extras.result_codes?.transaction;
      
      // Parse operation errors
      if (extras.result_codes?.operations) {
        result.operationResults = extras.result_codes.operations.map(
          (code: string, index: number) => ({
            index,
            success: code === 'op_success',
            type: 'unknown',
            details: { code },
          })
        );
      }
    }

    // Build error message
    if (result.errorCode) {
      result.errorMessage = this.getErrorMessage(result.errorCode);
    } else {
      result.errorMessage = error.message || 'Transaction submission failed';
    }

    return result;
  }

  private getErrorMessage(code: string): string {
    const errorMessages: Record<string, string> = {
      tx_failed: 'Transaction failed due to an operation error',
      tx_too_early: 'Transaction submitted too early',
      tx_too_late: 'Transaction submitted too late',
      tx_missing_operation: 'Transaction has no operations',
      tx_bad_seq: 'Sequence number mismatch',
      tx_bad_auth: 'Invalid transaction signatures',
      tx_insufficient_balance: 'Insufficient XLM balance for fee',
      tx_no_source_account: 'Source account not found',
      tx_bad_auth_extra: 'Unused signatures in transaction',
      tx_internal_error: 'Internal error occurred',
      tx_not_supported: 'Transaction type not supported',
      tx_fee_bump_inner_failed: 'Inner transaction failed',
      tx_bad_sponsorship: 'Invalid sponsorship',
    };

    return errorMessages[code] || `Unknown error: ${code}`;
  }
}

// Export singleton getter
export const getTransactionBuilder = () => TransactionBuilder.getInstance();
