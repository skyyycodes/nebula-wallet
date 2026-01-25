import { OHLCVData, TimeFrame, TradingPair, TIMEFRAME_SECONDS } from './types';

const HORIZON_API_BASE = 'https://horizon.stellar.org';

// Stellar Horizon supported resolutions in milliseconds
const HORIZON_RESOLUTIONS: Record<string, number> = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '1D': 86400000,
  '1W': 604800000,
};

// Map our timeframes to Horizon-supported resolutions
// 4h is not supported by Horizon, so we'll use 1h and aggregate
const TIMEFRAME_TO_RESOLUTION: Record<TimeFrame, { resolution: number; aggregate?: number }> = {
  '1m': { resolution: 60000 },
  '5m': { resolution: 300000 },
  '15m': { resolution: 900000 },
  '1h': { resolution: 3600000 },
  '4h': { resolution: 3600000, aggregate: 4 }, // Aggregate 4 x 1h candles
  '1D': { resolution: 86400000 },
  '1W': { resolution: 604800000 },
};

// Known Stellar asset issuers
const STELLAR_ASSET_ISSUERS: Record<string, { code: string; issuer: string; type: string }> = {
  USDC: {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    type: 'credit_alphanum4',
  },
  SRT: {
    code: 'SRT',
    issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    type: 'credit_alphanum4',
  },
  yUSDC: {
    code: 'yUSDC',
    issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF',
    type: 'credit_alphanum12',
  },
  AQUA: {
    code: 'AQUA',
    issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    type: 'credit_alphanum4',
  },
};

interface HorizonTradeAggregation {
  timestamp: string;
  trade_count: number;
  base_volume: string;
  counter_volume: string;
  avg: string;
  high: string;
  high_r: { N: number; D: number };
  low: string;
  low_r: { N: number; D: number };
  open: string;
  open_r: { N: number; D: number };
  close: string;
  close_r: { N: number; D: number };
}

interface HorizonResponse {
  _embedded: {
    records: HorizonTradeAggregation[];
  };
  _links: {
    next?: { href: string };
    prev?: { href: string };
  };
}

function parseAssetIdentifier(assetStr: string): { type: string; code?: string; issuer?: string } {
  if (assetStr === 'native' || assetStr === 'XLM') {
    return { type: 'native' };
  }

  // Check if it's a known asset
  if (STELLAR_ASSET_ISSUERS[assetStr]) {
    const asset = STELLAR_ASSET_ISSUERS[assetStr];
    return { type: asset.type, code: asset.code, issuer: asset.issuer };
  }

  // Try to parse CODE:ISSUER format
  if (assetStr.includes(':')) {
    const [code, issuer] = assetStr.split(':');
    const type = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
    return { type, code, issuer };
  }

  throw new Error(`Unknown asset: ${assetStr}`);
}

function buildAssetParams(prefix: string, asset: { type: string; code?: string; issuer?: string }): URLSearchParams {
  const params = new URLSearchParams();
  params.set(`${prefix}_asset_type`, asset.type);

  if (asset.type !== 'native') {
    params.set(`${prefix}_asset_code`, asset.code!);
    params.set(`${prefix}_asset_issuer`, asset.issuer!);
  }

  return params;
}

function aggregateCandles(candles: OHLCVData[], factor: number): OHLCVData[] {
  const aggregated: OHLCVData[] = [];

  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length === 0) continue;

    aggregated.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }

  return aggregated;
}

export class StellarHorizonService {
  private static instance: StellarHorizonService;

  static getInstance(): StellarHorizonService {
    if (!StellarHorizonService.instance) {
      StellarHorizonService.instance = new StellarHorizonService();
    }
    return StellarHorizonService.instance;
  }

  async getTradeAggregations(
    pair: TradingPair,
    timeframe: TimeFrame,
    barsCount: number = 200
  ): Promise<OHLCVData[]> {
    const { resolution, aggregate } = TIMEFRAME_TO_RESOLUTION[timeframe];

    // If we need to aggregate, fetch more candles
    const fetchCount = aggregate ? barsCount * aggregate : barsCount;

    const endTime = Date.now();
    const startTime = endTime - fetchCount * resolution;

    // Determine base and counter assets
    // In Stellar, the convention is base/counter where you're trading base FOR counter
    const baseAsset = this.resolveAsset(pair.base, pair.baseAddress);
    const counterAsset = this.resolveAsset(pair.quote, pair.quoteAddress);

    const params = new URLSearchParams();

    // Add base asset params
    params.set('base_asset_type', baseAsset.type);
    if (baseAsset.type !== 'native') {
      params.set('base_asset_code', baseAsset.code!);
      params.set('base_asset_issuer', baseAsset.issuer!);
    }

    // Add counter asset params
    params.set('counter_asset_type', counterAsset.type);
    if (counterAsset.type !== 'native') {
      params.set('counter_asset_code', counterAsset.code!);
      params.set('counter_asset_issuer', counterAsset.issuer!);
    }

    params.set('resolution', resolution.toString());
    params.set('start_time', startTime.toString());
    params.set('end_time', endTime.toString());
    params.set('limit', '200');
    params.set('order', 'asc');

    const url = `${HORIZON_API_BASE}/trade_aggregations?${params.toString()}`;

    console.log('[StellarHorizon] Fetching:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[StellarHorizon] API error:', response.status, errorText);
      throw new Error(`Horizon API error: ${response.status}`);
    }

    const data: HorizonResponse = await response.json();

    if (!data._embedded?.records || data._embedded.records.length === 0) {
      console.warn('[StellarHorizon] No trade data available for pair:', pair);
      throw new Error('No trade data available');
    }

    let candles = this.transformToOHLCV(data._embedded.records);

    // Aggregate if needed (for 4h timeframe)
    if (aggregate) {
      candles = aggregateCandles(candles, aggregate);
    }

    // Ensure we have the right amount of data
    if (candles.length > barsCount) {
      candles = candles.slice(-barsCount);
    }

    console.log(`[StellarHorizon] Fetched ${candles.length} candles for ${pair.base}/${pair.quote}`);

    return candles;
  }

  private resolveAsset(symbol: string, address?: string): { type: string; code?: string; issuer?: string } {
    // Check if it's XLM/native
    if (symbol === 'XLM' || address === 'native') {
      return { type: 'native' };
    }

    // Check if address contains full asset identifier
    if (address && address.includes(':')) {
      const [code, issuer] = address.split(':');
      const type = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
      return { type, code, issuer };
    }

    // Check known assets
    if (STELLAR_ASSET_ISSUERS[symbol]) {
      const asset = STELLAR_ASSET_ISSUERS[symbol];
      return { type: asset.type, code: asset.code, issuer: asset.issuer };
    }

    throw new Error(`Cannot resolve Stellar asset: ${symbol}`);
  }

  private transformToOHLCV(records: HorizonTradeAggregation[]): OHLCVData[] {
    return records.map(record => ({
      time: Math.floor(parseInt(record.timestamp) / 1000), // Convert ms to seconds
      open: parseFloat(record.open),
      high: parseFloat(record.high),
      low: parseFloat(record.low),
      close: parseFloat(record.close),
      volume: parseFloat(record.base_volume),
    }));
  }

  async getCurrentPrice(pair: TradingPair): Promise<{ price: number; change24h: number }> {
    try {
      // Fetch 24h of 1h candles to calculate current price and change
      const candles = await this.getTradeAggregations(pair, '1h', 24);

      if (candles.length === 0) {
        throw new Error('No price data');
      }

      const currentPrice = candles[candles.length - 1].close;
      const price24hAgo = candles[0].open;
      const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;

      return { price: currentPrice, change24h };
    } catch (error) {
      console.error('[StellarHorizon] getCurrentPrice error:', error);
      throw error;
    }
  }
}

export const getStellarHorizonService = () => StellarHorizonService.getInstance();
