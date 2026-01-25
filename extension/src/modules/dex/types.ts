/**
 * DEX Module Types
 * Data models for DEX aggregation, quotes, and routing
 */

import { Asset } from '@stellar/stellar-sdk';

/**
 * Supported DEX sources
 */
export enum DexSource {
  /** Native Stellar DEX (SDEX) orderbook */
  STELLAR_SDEX = 'stellar_sdex',
  /** Soroswap AMM (Soroban-based) */
  SOROSWAP = 'soroswap',
  /** Phoenix DEX (Soroban-based) */
  PHOENIX = 'phoenix',
  /** Aquarius Liquidity Pools */
  AQUARIUS = 'aquarius',
}

/**
 * Asset identifier that can be serialized
 */
export interface AssetId {
  /** Asset code */
  code: string;
  /** Asset issuer (null for native XLM) */
  issuer: string | null;
}

/**
 * Quote request parameters
 */
export interface QuoteRequest {
  /** Source asset */
  sourceAsset: AssetId;
  /** Destination asset */
  destAsset: AssetId;
  /** Amount to swap (in source asset units) */
  amount: string;
  /** Swap direction: 'exactIn' or 'exactOut' */
  swapType: 'exactIn' | 'exactOut';
  /** Maximum slippage tolerance (0.01 = 1%) */
  slippageTolerance: number;
  /** User's public key (for path finding) */
  userPublicKey?: string;
}

/**
 * Quote response from a single DEX source
 */
export interface Quote {
  /** Source that provided this quote */
  source: DexSource;
  /** Source asset */
  sourceAsset: AssetId;
  /** Destination asset */
  destAsset: AssetId;
  /** Amount being sold */
  sourceAmount: string;
  /** Amount being bought */
  destAmount: string;
  /** Effective exchange rate (destAmount / sourceAmount) */
  rate: number;
  /** Inverse rate (sourceAmount / destAmount) */
  inverseRate: number;
  /** Price impact percentage (negative = bad) */
  priceImpact: number;
  /** Estimated network fee in XLM */
  estimatedFee: string;
  /** Minimum received after slippage */
  minimumReceived: string;
  /** Route/path for the swap */
  route: SwapRoute;
  /** Quote expiration timestamp */
  expiresAt: number;
  /** Whether quote is still valid */
  isValid: boolean;
  /** Warnings about this quote */
  warnings: string[];
}

/**
 * Swap route information
 */
export interface SwapRoute {
  /** Route steps */
  steps: RouteStep[];
  /** Intermediate assets in the path */
  path: AssetId[];
  /** Total number of hops */
  hopCount: number;
  /** Is this a direct swap (no intermediate assets) */
  isDirect: boolean;
}

/**
 * Single step in a swap route
 */
export interface RouteStep {
  /** Step index */
  index: number;
  /** Input asset */
  inputAsset: AssetId;
  /** Output asset */
  outputAsset: AssetId;
  /** Input amount */
  inputAmount: string;
  /** Output amount */
  outputAmount: string;
  /** Liquidity source for this step */
  source: DexSource;
  /** Pool or orderbook identifier */
  poolId?: string;
}

/**
 * Aggregated quote result
 */
export interface AggregatedQuote {
  /** Request that generated this quote */
  request: QuoteRequest;
  /** Best quote across all sources */
  bestQuote: Quote | null;
  /** All quotes from different sources */
  allQuotes: Quote[];
  /** Why certain sources failed */
  failures: QuoteFailure[];
  /** Timestamp when aggregation completed */
  aggregatedAt: number;
  /** Time taken to aggregate in ms */
  aggregationTimeMs: number;
}

/**
 * Quote failure information
 */
export interface QuoteFailure {
  /** Source that failed */
  source: DexSource;
  /** Error message */
  error: string;
  /** Error code if available */
  code?: string;
}

/**
 * Orderbook depth entry
 */
export interface OrderbookEntry {
  /** Price level */
  price: string;
  /** Amount available at this price */
  amount: string;
  /** Price as a number */
  priceNum: number;
  /** Amount as a number */
  amountNum: number;
}

/**
 * Full orderbook for an asset pair
 */
export interface Orderbook {
  /** Base asset */
  baseAsset: AssetId;
  /** Counter asset */
  counterAsset: AssetId;
  /** Bid orders (buying base) */
  bids: OrderbookEntry[];
  /** Ask orders (selling base) */
  asks: OrderbookEntry[];
  /** Best bid price */
  bestBid: string | null;
  /** Best ask price */
  bestAsk: string | null;
  /** Spread percentage */
  spreadPercent: number | null;
  /** Timestamp when fetched */
  fetchedAt: number;
}

/**
 * Liquidity pool information
 */
export interface LiquidityPool {
  /** Pool identifier */
  poolId: string;
  /** Pool type */
  type: 'constant_product' | 'stable' | 'concentrated';
  /** Assets in the pool */
  assets: AssetId[];
  /** Reserves for each asset */
  reserves: string[];
  /** Total LP tokens */
  totalShares: string;
  /** Trading fee percentage */
  feePercent: number;
  /** Source DEX */
  source: DexSource;
}

/**
 * Swap execution parameters
 */
export interface SwapParams {
  /** Quote to execute */
  quote: Quote;
  /** User's public key */
  userPublicKey: string;
  /** Slippage tolerance override */
  slippageTolerance?: number;
  /** Deadline timestamp */
  deadline?: number;
}

/**
 * Swap execution result
 */
export interface SwapResult {
  /** Whether swap was successful */
  success: boolean;
  /** Transaction hash */
  transactionHash: string;
  /** Actual source amount spent */
  sourceAmountSpent: string;
  /** Actual destination amount received */
  destAmountReceived: string;
  /** Actual exchange rate achieved */
  actualRate: number;
  /** Fee paid in XLM */
  feePaid: string;
  /** Ledger number */
  ledger: number;
  /** Error if failed */
  error?: string;
}

/**
 * Interface that all liquidity sources must implement
 */
export interface ILiquiditySource {
  /** Source identifier */
  readonly source: DexSource;
  /** Human-readable name */
  readonly name: string;
  /** Whether this source is currently enabled */
  isEnabled(): boolean;
  /** Enable or disable this source */
  setEnabled(enabled: boolean): void;
  /** Check if source supports given asset pair */
  supportsPair(sourceAsset: AssetId, destAsset: AssetId): Promise<boolean>;
  /** Get a quote for a swap */
  getQuote(request: QuoteRequest): Promise<Quote>;
  /** Get orderbook or liquidity info for asset pair */
  getOrderbook?(baseAsset: AssetId, counterAsset: AssetId): Promise<Orderbook>;
  /** Get liquidity pools containing an asset */
  getPools?(asset: AssetId): Promise<LiquidityPool[]>;
}

/**
 * DEX aggregator configuration
 */
export interface AggregatorConfig {
  /** Enabled DEX sources */
  enabledSources: DexSource[];
  /** Default slippage tolerance */
  defaultSlippage: number;
  /** Quote timeout in ms */
  quoteTimeoutMs: number;
  /** Whether to include failing sources in response */
  includeFailures: boolean;
  /** Minimum liquidity threshold */
  minLiquidityUsd: number;
}
