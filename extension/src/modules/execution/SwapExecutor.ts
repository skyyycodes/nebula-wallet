/**
 * Swap Executor
 * Handles building and executing swap transactions
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from '../network';
import { getAccountService, getTransactionBuilder } from '../wallet';
import { Quote, SwapResult, AssetId } from '../dex/types';
import {
  SwapExecutionRequest,
  ExecutionMode,
  ExecutionStatus,
  ExecutionOptions,
  ExecutionProgressCallback,
} from './types';

const DEFAULT_TIMEOUT = 180; // 3 minutes

export class SwapExecutor {
  private static instance: SwapExecutor | null = null;

  private constructor() {}

  static getInstance(): SwapExecutor {
    if (!SwapExecutor.instance) {
      SwapExecutor.instance = new SwapExecutor();
    }
    return SwapExecutor.instance;
  }

  /**
   * Execute a swap based on a quote
   */
  async executeSwap(
    request: SwapExecutionRequest,
    options: ExecutionOptions = {}
  ): Promise<SwapResult> {
    const { onProgress } = options;

    try {
      // Validate quote
      this.notifyProgress(onProgress, ExecutionStatus.PENDING, 'Validating quote...');
      this.validateQuote(request.quote);

      // Build transaction
      this.notifyProgress(onProgress, ExecutionStatus.BUILDING, 'Building transaction...');
      const transaction = await this.buildSwapTransaction(request, options);

      // If build only mode, return early
      if (request.mode === ExecutionMode.BUILD_ONLY) {
        return {
          success: true,
          transactionHash: '',
          sourceAmountSpent: request.quote.sourceAmount,
          destAmountReceived: request.quote.minimumReceived,
          actualRate: request.quote.rate,
          feePaid: '0',
          ledger: 0,
        };
      }

      // Sign transaction
      this.notifyProgress(onProgress, ExecutionStatus.SIGNING, 'Signing transaction...');
      const keypair = StellarSdk.Keypair.fromSecret(request.secretKey);
      transaction.sign(keypair);

      // If simulate mode, return without submitting
      if (request.mode === ExecutionMode.SIMULATE) {
        this.notifyProgress(onProgress, ExecutionStatus.CONFIRMED, 'Simulation complete');
        return {
          success: true,
          transactionHash: transaction.hash().toString('hex'),
          sourceAmountSpent: request.quote.sourceAmount,
          destAmountReceived: request.quote.minimumReceived,
          actualRate: request.quote.rate,
          feePaid: transaction.fee.toString(),
          ledger: 0,
        };
      }

      // Submit transaction
      this.notifyProgress(onProgress, ExecutionStatus.SUBMITTING, 'Submitting transaction...');
      const result = await this.submitTransaction(transaction);

      if (result.success) {
        this.notifyProgress(onProgress, ExecutionStatus.CONFIRMED, 'Swap confirmed!');
      } else {
        this.notifyProgress(onProgress, ExecutionStatus.FAILED, result.error);
      }

      return result;
    } catch (error: any) {
      this.notifyProgress(onProgress, ExecutionStatus.FAILED, error.message);
      return {
        success: false,
        transactionHash: '',
        sourceAmountSpent: '0',
        destAmountReceived: '0',
        actualRate: 0,
        feePaid: '0',
        ledger: 0,
        error: error.message,
      };
    }
  }

  /**
   * Build a swap transaction without executing
   */
  async buildSwapTransaction(
    request: SwapExecutionRequest,
    options: ExecutionOptions = {}
  ): Promise<StellarSdk.Transaction> {
    const networkManager = getNetworkManager();
    const accountService = getAccountService();
    const config = networkManager.getConfig();

    const quote = request.quote;
    const slippage = request.slippageTolerance ?? 0.005;

    // Load source account
    const sourceAccount = await accountService.loadAccount(request.userPublicKey);

    // Determine fee
    let fee: number;
    if (options.useDynamicFee) {
      fee = await networkManager.getRecommendedFee();
    } else {
      fee = options.maxFee ?? config.defaultBaseFee;
    }

    // Create transaction builder
    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: config.passphrase,
    });

    // Convert assets
    const sourceAsset = this.assetIdToAsset(quote.sourceAsset);
    const destAsset = this.assetIdToAsset(quote.destAsset);

    // Build path assets from route
    const pathAssets = quote.route.path.map(a => this.assetIdToAsset(a));

    // Calculate amounts with slippage
    const sourceAmount = quote.sourceAmount;
    const minDestAmount = this.calculateMinimumReceived(quote.destAmount, slippage);

    // Add path payment operation
    // Using strict send for exactIn, strict receive for others
    builder.addOperation(
      StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: sourceAsset,
        sendAmount: sourceAmount,
        destination: request.userPublicKey, // Self-swap
        destAsset: destAsset,
        destMin: minDestAmount,
        path: pathAssets,
      })
    );

    // Add memo if provided
    if (request.memo) {
      builder.addMemo(StellarSdk.Memo.text(request.memo));
    }

    // Set timeout
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    builder.setTimeout(timeout);

    return builder.build();
  }

  /**
   * Estimate gas/fee for a swap
   */
  async estimateSwapFee(quote: Quote): Promise<string> {
    const networkManager = getNetworkManager();
    const feeStats = await networkManager.getFeeStats();

    // Path payment is 1 operation, but may need more for trustline
    const operationCount = quote.route.hopCount > 0 ? 1 : 1;
    const totalFee = feeStats.recommended * operationCount;

    return (totalFee / 10000000).toFixed(7); // Convert stroops to XLM
  }

  /**
   * Check if user has required trustlines for swap
   */
  async checkTrustlines(
    userPublicKey: string,
    quote: Quote
  ): Promise<{ hasAllTrustlines: boolean; missingTrustlines: AssetId[] }> {
    const accountService = getAccountService();
    const missingTrustlines: AssetId[] = [];

    // Check destination asset trustline (if not native)
    if (quote.destAsset.issuer) {
      const hasDestTrustline = await accountService.hasTrustline(
        userPublicKey,
        quote.destAsset.code,
        quote.destAsset.issuer
      );
      if (!hasDestTrustline) {
        missingTrustlines.push(quote.destAsset);
      }
    }

    // Check intermediate assets in path
    for (const asset of quote.route.path) {
      if (asset.issuer) {
        const hasTrustline = await accountService.hasTrustline(
          userPublicKey,
          asset.code,
          asset.issuer
        );
        if (!hasTrustline) {
          missingTrustlines.push(asset);
        }
      }
    }

    return {
      hasAllTrustlines: missingTrustlines.length === 0,
      missingTrustlines,
    };
  }

  /**
   * Create trustline transaction for missing assets
   */
  async buildTrustlineTransaction(
    userPublicKey: string,
    assets: AssetId[]
  ): Promise<StellarSdk.Transaction> {
    const networkManager = getNetworkManager();
    const accountService = getAccountService();
    const config = networkManager.getConfig();

    const sourceAccount = await accountService.loadAccount(userPublicKey);
    const fee = await networkManager.getRecommendedFee(assets.length);

    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: config.passphrase,
    });

    for (const asset of assets) {
      if (asset.issuer) {
        builder.addOperation(
          StellarSdk.Operation.changeTrust({
            asset: new StellarSdk.Asset(asset.code, asset.issuer),
          })
        );
      }
    }

    builder.setTimeout(DEFAULT_TIMEOUT);
    return builder.build();
  }

  // Private methods

  private validateQuote(quote: Quote): void {
    if (!quote.isValid) {
      throw new Error('Quote has expired');
    }
    if (Date.now() > quote.expiresAt) {
      throw new Error('Quote has expired');
    }
    if (parseFloat(quote.sourceAmount) <= 0) {
      throw new Error('Invalid source amount');
    }
    if (parseFloat(quote.destAmount) <= 0) {
      throw new Error('Invalid destination amount');
    }
  }

  private assetIdToAsset(assetId: AssetId): StellarSdk.Asset {
    if (!assetId.issuer) {
      return StellarSdk.Asset.native();
    }
    return new StellarSdk.Asset(assetId.code, assetId.issuer);
  }

  private calculateMinimumReceived(amount: string, slippage: number): string {
    const amountNum = parseFloat(amount);
    const minReceived = amountNum * (1 - slippage);
    return minReceived.toFixed(7);
  }

  private async submitTransaction(
    transaction: StellarSdk.Transaction
  ): Promise<SwapResult> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    try {
      const response = await server.submitTransaction(transaction);

      return {
        success: true,
        transactionHash: response.hash,
        sourceAmountSpent: '0', // Would need to parse result XDR
        destAmountReceived: '0', // Would need to parse result XDR
        actualRate: 0,
        feePaid: (response as any).fee_charged?.toString() || '0',
        ledger: response.ledger,
      };
    } catch (error: any) {
      const errorMessage = this.parseSubmitError(error);
      return {
        success: false,
        transactionHash: transaction.hash().toString('hex'),
        sourceAmountSpent: '0',
        destAmountReceived: '0',
        actualRate: 0,
        feePaid: '0',
        ledger: 0,
        error: errorMessage,
      };
    }
  }

  private parseSubmitError(error: any): string {
    if (error.response?.data?.extras?.result_codes) {
      const codes = error.response.data.extras.result_codes;
      if (codes.operations) {
        const opErrors = codes.operations.filter((c: string) => c !== 'op_success');
        if (opErrors.includes('op_underfunded')) {
          return 'Insufficient balance for swap';
        }
        if (opErrors.includes('op_line_full')) {
          return 'Destination trustline is full';
        }
        if (opErrors.includes('op_no_trust')) {
          return 'Missing trustline for asset';
        }
        if (opErrors.includes('op_too_few_offers')) {
          return 'Not enough liquidity for swap';
        }
        if (opErrors.includes('op_cross_self')) {
          return 'Would cross own offer';
        }
        return `Operation failed: ${opErrors.join(', ')}`;
      }
      if (codes.transaction) {
        return `Transaction failed: ${codes.transaction}`;
      }
    }
    return error.message || 'Unknown error during swap';
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
export const getSwapExecutor = () => SwapExecutor.getInstance();
