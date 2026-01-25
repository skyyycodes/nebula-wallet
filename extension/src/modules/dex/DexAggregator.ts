/**
 * DEX Aggregator
 * Aggregates quotes from multiple liquidity sources and selects the best route
 */

import {
  DexSource,
  AssetId,
  Quote,
  QuoteRequest,
  AggregatedQuote,
  QuoteFailure,
  ILiquiditySource,
  AggregatorConfig,
} from './types';
import { getStellarDexSource } from './sources';

const DEFAULT_CONFIG: AggregatorConfig = {
  enabledSources: [DexSource.STELLAR_SDEX],
  defaultSlippage: 0.005, // 0.5%
  quoteTimeoutMs: 10000, // 10 seconds
  includeFailures: true,
  minLiquidityUsd: 0,
};

export class DexAggregator {
  private static instance: DexAggregator | null = null;
  private sources: Map<DexSource, ILiquiditySource> = new Map();
  private config: AggregatorConfig;

  private constructor(config: Partial<AggregatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeSources();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DexAggregator {
    if (!DexAggregator.instance) {
      DexAggregator.instance = new DexAggregator();
    }
    return DexAggregator.instance;
  }

  /**
   * Initialize with custom configuration
   */
  static initialize(config: Partial<AggregatorConfig>): DexAggregator {
    DexAggregator.instance = new DexAggregator(config);
    return DexAggregator.instance;
  }

  /**
   * Get aggregated quote from all enabled sources
   */
  async getQuote(request: QuoteRequest): Promise<AggregatedQuote> {
    const startTime = Date.now();
    const allQuotes: Quote[] = [];
    const failures: QuoteFailure[] = [];

    // Apply default slippage if not specified
    const requestWithDefaults: QuoteRequest = {
      ...request,
      slippageTolerance: request.slippageTolerance ?? this.config.defaultSlippage,
    };

    // Query all enabled sources in parallel
    const quotePromises: Promise<void>[] = [];

    for (const source of this.config.enabledSources) {
      const liquiditySource = this.sources.get(source);
      if (!liquiditySource || !liquiditySource.isEnabled()) {
        continue;
      }

      const promise = this.fetchQuoteWithTimeout(liquiditySource, requestWithDefaults)
        .then(quote => {
          if (quote) {
            allQuotes.push(quote);
          }
        })
        .catch(error => {
          failures.push({
            source,
            error: error.message,
          });
        });

      quotePromises.push(promise);
    }

    // Wait for all quotes
    await Promise.allSettled(quotePromises);

    // Select best quote
    const bestQuote = this.selectBestQuote(allQuotes, requestWithDefaults.swapType);

    return {
      request: requestWithDefaults,
      bestQuote,
      allQuotes: this.sortQuotes(allQuotes, requestWithDefaults.swapType),
      failures: this.config.includeFailures ? failures : [],
      aggregatedAt: Date.now(),
      aggregationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get quotes from a specific source
   */
  async getQuoteFromSource(
    source: DexSource,
    request: QuoteRequest
  ): Promise<Quote> {
    const liquiditySource = this.sources.get(source);
    if (!liquiditySource) {
      throw new Error(`Source ${source} not registered`);
    }
    if (!liquiditySource.isEnabled()) {
      throw new Error(`Source ${source} is disabled`);
    }

    return liquiditySource.getQuote(request);
  }

  /**
   * Check if a pair is tradeable on any source
   */
  async isPairTradeable(
    sourceAsset: AssetId,
    destAsset: AssetId
  ): Promise<boolean> {
    for (const source of this.config.enabledSources) {
      const liquiditySource = this.sources.get(source);
      if (!liquiditySource || !liquiditySource.isEnabled()) {
        continue;
      }

      try {
        const supported = await liquiditySource.supportsPair(sourceAsset, destAsset);
        if (supported) {
          return true;
        }
      } catch {
        // Continue to next source
      }
    }

    return false;
  }

  /**
   * Get list of available sources
   */
  getAvailableSources(): DexSource[] {
    return Array.from(this.sources.keys()).filter(source => {
      const ls = this.sources.get(source);
      return ls && ls.isEnabled();
    });
  }

  /**
   * Enable or disable a source
   */
  setSourceEnabled(source: DexSource, enabled: boolean): void {
    const liquiditySource = this.sources.get(source);
    if (liquiditySource) {
      liquiditySource.setEnabled(enabled);
    }
  }

  /**
   * Update aggregator configuration
   */
  updateConfig(config: Partial<AggregatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register a new liquidity source
   */
  registerSource(source: ILiquiditySource): void {
    this.sources.set(source.source, source);
    if (!this.config.enabledSources.includes(source.source)) {
      this.config.enabledSources.push(source.source);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AggregatorConfig {
    return { ...this.config };
  }

  // Private methods

  private initializeSources(): void {
    // Register Stellar SDEX source
    const stellarDex = getStellarDexSource();
    this.sources.set(DexSource.STELLAR_SDEX, stellarDex);

    // Future: Register other sources
    // this.sources.set(DexSource.SOROSWAP, getSoroswapSource());
    // this.sources.set(DexSource.PHOENIX, getPhoenixSource());
    // this.sources.set(DexSource.AQUARIUS, getAquariusSource());
  }

  private async fetchQuoteWithTimeout(
    source: ILiquiditySource,
    request: QuoteRequest
  ): Promise<Quote | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Quote timeout from ${source.name}`));
      }, this.config.quoteTimeoutMs);

      source.getQuote(request)
        .then(quote => {
          clearTimeout(timeout);
          resolve(quote);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private selectBestQuote(
    quotes: Quote[],
    swapType: 'exactIn' | 'exactOut'
  ): Quote | null {
    if (quotes.length === 0) {
      return null;
    }

    // Sort quotes and return the best one
    const sorted = this.sortQuotes(quotes, swapType);
    return sorted[0];
  }

  private sortQuotes(quotes: Quote[], swapType: 'exactIn' | 'exactOut'): Quote[] {
    return [...quotes].sort((a, b) => {
      if (swapType === 'exactIn') {
        // For exact input, we want maximum output
        const destA = parseFloat(a.destAmount);
        const destB = parseFloat(b.destAmount);
        return destB - destA; // Higher is better
      } else {
        // For exact output, we want minimum input
        const sourceA = parseFloat(a.sourceAmount);
        const sourceB = parseFloat(b.sourceAmount);
        return sourceA - sourceB; // Lower is better
      }
    });
  }
}

// Export singleton getter
export const getDexAggregator = () => DexAggregator.getInstance();

/**
 * Convenience function to get a quote
 */
export async function getSwapQuote(
  sourceAsset: AssetId,
  destAsset: AssetId,
  amount: string,
  swapType: 'exactIn' | 'exactOut' = 'exactIn',
  slippageTolerance: number = 0.005,
  userPublicKey?: string
): Promise<AggregatedQuote> {
  const aggregator = getDexAggregator();
  return aggregator.getQuote({
    sourceAsset,
    destAsset,
    amount,
    swapType,
    slippageTolerance,
    userPublicKey,
  });
}
