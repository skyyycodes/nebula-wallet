/**
 * Stellar SDEX Liquidity Source
 * Native Stellar DEX orderbook integration
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from '../../network';
import { BaseLiquiditySource } from '../BaseLiquiditySource';
import {
  DexSource,
  AssetId,
  Quote,
  QuoteRequest,
  Orderbook,
  OrderbookEntry,
  SwapRoute,
} from '../types';

const QUOTE_TTL_SECONDS = 30;
const MAX_PATH_LENGTH = 6;

export class StellarDexSource extends BaseLiquiditySource {
  readonly source = DexSource.STELLAR_SDEX;
  readonly name = 'Stellar DEX';

  /**
   * Check if pair is tradeable on SDEX
   */
  async supportsPair(sourceAsset: AssetId, destAsset: AssetId): Promise<boolean> {
    // SDEX supports any asset pair as long as both assets exist
    // and there's liquidity in the orderbook
    try {
      const orderbook = await this.getOrderbook(sourceAsset, destAsset);
      return orderbook.bids.length > 0 || orderbook.asks.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get quote for a swap using path payment or direct orderbook
   */
  async getQuote(request: QuoteRequest): Promise<Quote> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    const config = networkManager.getConfig();

    const sourceAssetSdk = this.assetIdToAsset(request.sourceAsset);
    const destAssetSdk = this.assetIdToAsset(request.destAsset);
    const amount = request.amount;

    try {
      // Find payment paths
      const paths = await this.findPaths(
        server,
        request.userPublicKey || config.horizonUrl, // Use horizon as dummy if no user
        sourceAssetSdk,
        destAssetSdk,
        amount,
        request.swapType
      );

      if (paths.length === 0) {
        throw new Error('No paths found for this swap');
      }

      // Get the best path
      const bestPath = paths[0];
      
      // Calculate quote details
      const sourceAmount = request.swapType === 'exactIn' 
        ? amount 
        : bestPath.source_amount;
      const destAmount = request.swapType === 'exactIn'
        ? bestPath.destination_amount
        : amount;

      const sourceNum = this.parseAmount(sourceAmount);
      const destNum = this.parseAmount(destAmount);
      const rate = destNum / sourceNum;
      const inverseRate = sourceNum / destNum;

      // Get market rate for price impact calculation
      const orderbook = await this.getOrderbook(request.sourceAsset, request.destAsset);
      const marketRate = orderbook.bestAsk 
        ? 1 / parseFloat(orderbook.bestAsk) 
        : rate;
      const priceImpact = this.calculatePriceImpact(marketRate, rate);

      // Build route information
      const route = this.buildRoute(
        request.sourceAsset,
        request.destAsset,
        bestPath.path || [],
        sourceAmount,
        destAmount
      );

      // Calculate fee estimate (base fee per operation)
      const feeStats = await networkManager.getFeeStats();
      const estimatedFee = (feeStats.recommended / 10000000).toFixed(7);

      // Calculate minimum received with slippage
      const minimumReceived = this.calculateMinimumReceived(
        destAmount,
        request.slippageTolerance
      );

      return {
        source: this.source,
        sourceAsset: request.sourceAsset,
        destAsset: request.destAsset,
        sourceAmount,
        destAmount,
        rate,
        inverseRate,
        priceImpact,
        estimatedFee,
        minimumReceived,
        route,
        expiresAt: this.getQuoteExpiration(QUOTE_TTL_SECONDS),
        isValid: true,
        warnings: this.generateWarnings(priceImpact, route),
      };
    } catch (error: any) {
      throw new Error(`SDEX quote failed: ${error.message}`);
    }
  }

  /**
   * Get orderbook for an asset pair
   */
  async getOrderbook(baseAsset: AssetId, counterAsset: AssetId): Promise<Orderbook> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    const baseAssetSdk = this.assetIdToAsset(baseAsset);
    const counterAssetSdk = this.assetIdToAsset(counterAsset);

    try {
      const orderbookResponse = await server
        .orderbook(baseAssetSdk, counterAssetSdk)
        .limit(50)
        .call();

      const bids: OrderbookEntry[] = orderbookResponse.bids.map((bid: any) => ({
        price: bid.price,
        amount: bid.amount,
        priceNum: parseFloat(bid.price),
        amountNum: parseFloat(bid.amount),
      }));

      const asks: OrderbookEntry[] = orderbookResponse.asks.map((ask: any) => ({
        price: ask.price,
        amount: ask.amount,
        priceNum: parseFloat(ask.price),
        amountNum: parseFloat(ask.amount),
      }));

      const bestBid = bids.length > 0 ? bids[0].price : null;
      const bestAsk = asks.length > 0 ? asks[0].price : null;

      let spreadPercent: number | null = null;
      if (bestBid && bestAsk) {
        const bidNum = parseFloat(bestBid);
        const askNum = parseFloat(bestAsk);
        spreadPercent = ((askNum - bidNum) / askNum) * 100;
      }

      return {
        baseAsset,
        counterAsset,
        bids,
        asks,
        bestBid,
        bestAsk,
        spreadPercent,
        fetchedAt: Date.now(),
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch orderbook: ${error.message}`);
    }
  }

  /**
   * Find strict receive paths (exact output amount)
   */
  async findStrictReceivePaths(
    sourceAsset: AssetId,
    destAsset: AssetId,
    destAmount: string,
    sourceAccount?: string
  ): Promise<StellarSdk.Horizon.ServerApi.PaymentPathRecord[]> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    const sourceAssetSdk = this.assetIdToAsset(sourceAsset);
    const destAssetSdk = this.assetIdToAsset(destAsset);

    const pathsCall = server.strictReceivePaths(
      [sourceAssetSdk],
      destAssetSdk,
      destAmount
    );

    const response = await pathsCall.call();
    return response.records;
  }

  /**
   * Find strict send paths (exact input amount)
   */
  async findStrictSendPaths(
    sourceAsset: AssetId,
    destAsset: AssetId,
    sourceAmount: string,
    destAccount?: string
  ): Promise<StellarSdk.Horizon.ServerApi.PaymentPathRecord[]> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    const sourceAssetSdk = this.assetIdToAsset(sourceAsset);
    const destAssetSdk = this.assetIdToAsset(destAsset);

    const pathsCall = server.strictSendPaths(
      sourceAssetSdk,
      sourceAmount,
      [destAssetSdk]
    );

    const response = await pathsCall.call();
    return response.records;
  }

  // Private methods

  private async findPaths(
    server: StellarSdk.Horizon.Server,
    userPublicKey: string,
    sourceAsset: StellarSdk.Asset,
    destAsset: StellarSdk.Asset,
    amount: string,
    swapType: 'exactIn' | 'exactOut'
  ): Promise<StellarSdk.Horizon.ServerApi.PaymentPathRecord[]> {
    if (swapType === 'exactIn') {
      // Strict send: exact source amount, variable destination
      const paths = await server
        .strictSendPaths(sourceAsset, amount, [destAsset])
        .call();
      return paths.records;
    } else {
      // Strict receive: variable source, exact destination amount
      const paths = await server
        .strictReceivePaths([sourceAsset], destAsset, amount)
        .call();
      return paths.records;
    }
  }

  private buildRoute(
    sourceAsset: AssetId,
    destAsset: AssetId,
    pathAssets: Array<{ asset_code?: string; asset_issuer?: string; asset_type: string }>,
    sourceAmount: string,
    destAmount: string
  ): SwapRoute {
    const intermediateAssets: AssetId[] = pathAssets.map(asset => ({
      code: asset.asset_code || 'XLM',
      issuer: asset.asset_issuer || null,
    }));

    const steps = [];
    const allAssets = [sourceAsset, ...intermediateAssets, destAsset];

    for (let i = 0; i < allAssets.length - 1; i++) {
      steps.push({
        index: i,
        inputAsset: allAssets[i],
        outputAsset: allAssets[i + 1],
        inputAmount: i === 0 ? sourceAmount : 'variable',
        outputAmount: i === allAssets.length - 2 ? destAmount : 'variable',
        source: this.source,
      });
    }

    return {
      steps,
      path: intermediateAssets,
      hopCount: steps.length,
      isDirect: intermediateAssets.length === 0,
    };
  }

  private generateWarnings(priceImpact: number, route: SwapRoute): string[] {
    const warnings: string[] = [];

    if (priceImpact < -1) {
      warnings.push('Price impact is significant (>1%)');
    }
    if (priceImpact < -5) {
      warnings.push('⚠️ High price impact (>5%). Consider smaller trade.');
    }
    if (route.hopCount > 2) {
      warnings.push('Multi-hop route may have higher fees');
    }

    return warnings;
  }
}

// Export singleton
let stellarDexSourceInstance: StellarDexSource | null = null;

export const getStellarDexSource = (): StellarDexSource => {
  if (!stellarDexSourceInstance) {
    stellarDexSourceInstance = new StellarDexSource();
  }
  return stellarDexSourceInstance;
};
