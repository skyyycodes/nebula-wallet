/**
 * Base Liquidity Source
 * Abstract class providing common functionality for DEX integrations
 */

import { Asset } from '@stellar/stellar-sdk';
import {
  DexSource,
  AssetId,
  Quote,
  QuoteRequest,
  Orderbook,
  LiquidityPool,
  ILiquiditySource,
} from './types';

export abstract class BaseLiquiditySource implements ILiquiditySource {
  abstract readonly source: DexSource;
  abstract readonly name: string;

  protected enabled: boolean = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  abstract supportsPair(sourceAsset: AssetId, destAsset: AssetId): Promise<boolean>;
  abstract getQuote(request: QuoteRequest): Promise<Quote>;

  // Optional methods with default implementations
  async getOrderbook?(baseAsset: AssetId, counterAsset: AssetId): Promise<Orderbook> {
    throw new Error('Orderbook not supported by this source');
  }

  async getPools?(asset: AssetId): Promise<LiquidityPool[]> {
    throw new Error('Pool listing not supported by this source');
  }

  // Helper methods for subclasses

  /**
   * Convert AssetId to Stellar SDK Asset
   */
  protected assetIdToAsset(assetId: AssetId): Asset {
    if (!assetId.issuer) {
      return Asset.native();
    }
    return new Asset(assetId.code, assetId.issuer);
  }

  /**
   * Convert Stellar SDK Asset to AssetId
   */
  protected assetToAssetId(asset: Asset): AssetId {
    if (asset.isNative()) {
      return { code: 'XLM', issuer: null };
    }
    return { code: asset.getCode(), issuer: asset.getIssuer() };
  }

  /**
   * Calculate price impact from orderbook depth
   */
  protected calculatePriceImpact(
    marketPrice: number,
    executionPrice: number
  ): number {
    if (marketPrice === 0) return 0;
    return ((executionPrice - marketPrice) / marketPrice) * 100;
  }

  /**
   * Calculate minimum received after slippage
   */
  protected calculateMinimumReceived(
    amount: string,
    slippageTolerance: number
  ): string {
    const amountNum = parseFloat(amount);
    const minReceived = amountNum * (1 - slippageTolerance);
    return minReceived.toFixed(7);
  }

  /**
   * Check if quote is still valid (not expired)
   */
  protected isQuoteValid(quote: Quote): boolean {
    return Date.now() < quote.expiresAt;
  }

  /**
   * Generate quote expiration timestamp
   */
  protected getQuoteExpiration(ttlSeconds: number = 30): number {
    return Date.now() + ttlSeconds * 1000;
  }

  /**
   * Format amount to 7 decimal places (Stellar standard)
   */
  protected formatAmount(amount: number): string {
    return amount.toFixed(7);
  }

  /**
   * Parse amount string to number
   */
  protected parseAmount(amount: string): number {
    return parseFloat(amount);
  }
}
