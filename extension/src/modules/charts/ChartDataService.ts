import { OHLCVData, TimeFrame, TradingPair, TIMEFRAME_SECONDS, SOLANA_TOKENS, STELLAR_TOKENS } from './types';
import { getStellarHorizonService } from './StellarHorizonService';

const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';

// Base prices for different tokens (approximate USD values)
const TOKEN_BASE_PRICES: Record<string, number> = {
  XLM: 0.38,    // Stellar Lumens ~ $0.38
  SOL: 126,     // Solana ~ $126
  USDC: 1,      // USDC ~ $1
  USDT: 1,      // USDT ~ $1
  BONK: 0.000025,
  JUP: 0.85,
  WIF: 1.80,
  SRT: 0.01,
};

// Get the price ratio between two tokens
function getPairBasePrice(pair: TradingPair): number {
  const basePrice = TOKEN_BASE_PRICES[pair.base] || 1;
  const quotePrice = TOKEN_BASE_PRICES[pair.quote] || 1;
  return basePrice / quotePrice;
}

// Generate realistic mock data for development/fallback
function generateMockOHLCVData(
  pair: TradingPair,
  timeframe: TimeFrame,
  barsCount: number = 200
): OHLCVData[] {
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
  const data: OHLCVData[] = [];

  // Calculate base price from pair
  let basePrice = getPairBasePrice(pair);

  // Add some historical trend
  const trendDirection = Math.random() > 0.5 ? 1 : -1;
  const trendStrength = 0.0001;

  for (let i = barsCount - 1; i >= 0; i--) {
    const time = now - i * intervalSeconds;

    // Apply micro-trend
    basePrice *= 1 + trendDirection * trendStrength * (Math.random() - 0.3);

    // Generate OHLC with realistic patterns
    const volatility = 0.002 + Math.random() * 0.008; // 0.2% to 1% volatility
    const open = basePrice * (1 + (Math.random() - 0.5) * volatility);
    const close = basePrice * (1 + (Math.random() - 0.5) * volatility);
    const high = Math.max(open, close) * (1 + Math.random() * volatility);
    const low = Math.min(open, close) * (1 - Math.random() * volatility);

    // Volume correlates with price movement
    const priceChange = Math.abs(close - open) / open;
    const baseVolume = 50000 + Math.random() * 150000;
    const volume = baseVolume * (1 + priceChange * 10);

    data.push({
      time,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: Math.floor(volume),
    });

    basePrice = close;
  }

  return data;
}

export class ChartDataService {
  private static instance: ChartDataService;
  private cache: Map<string, { data: OHLCVData[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds cache

  static getInstance(): ChartDataService {
    if (!ChartDataService.instance) {
      ChartDataService.instance = new ChartDataService();
    }
    return ChartDataService.instance;
  }

  private getCacheKey(pair: TradingPair, timeframe: TimeFrame): string {
    return `${pair.base}-${pair.quote}-${timeframe}`;
  }

  private isStellarPair(pair: TradingPair): boolean {
    return pair.base === 'XLM' || pair.quote === 'XLM' ||
           pair.base === 'SRT' || pair.quote === 'SRT' ||
           (pair.baseAddress?.includes(':') || pair.baseAddress === 'native');
  }

  async getOHLCVData(
    pair: TradingPair,
    timeframe: TimeFrame,
    barsCount: number = 200
  ): Promise<OHLCVData[]> {
    const cacheKey = this.getCacheKey(pair, timeframe);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // For Stellar pairs, use the Stellar Horizon API for real data
    if (this.isStellarPair(pair)) {
      try {
        const stellarService = getStellarHorizonService();
        const data = await stellarService.getTradeAggregations(pair, timeframe, barsCount);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        console.warn('[ChartDataService] Stellar API failed, using mock data:', error);
        // Fall back to mock data if API fails
        const mockData = generateMockOHLCVData(pair, timeframe, barsCount);
        this.cache.set(cacheKey, { data: mockData, timestamp: Date.now() });
        return mockData;
      }
    }

    // For Solana pairs, use mock data (Birdeye requires API key)
    // TODO: Add Birdeye API integration when API key is available
    const mockData = generateMockOHLCVData(pair, timeframe, barsCount);
    this.cache.set(cacheKey, { data: mockData, timestamp: Date.now() });
    return mockData;
  }

  private async fetchFromBirdeye(
    pair: TradingPair,
    timeframe: TimeFrame,
    barsCount: number
  ): Promise<OHLCVData[]> {
    const baseAddress = pair.baseAddress || SOLANA_TOKENS[pair.base as keyof typeof SOLANA_TOKENS];
    const quoteAddress = pair.quoteAddress || SOLANA_TOKENS[pair.quote as keyof typeof SOLANA_TOKENS];

    if (!baseAddress) {
      throw new Error(`Unknown token: ${pair.base}`);
    }

    // Convert timeframe to Birdeye format
    const timeframeMap: Record<TimeFrame, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1H',
      '4h': '4H',
      '1D': '1D',
      '1W': '1W',
    };

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - barsCount * intervalSeconds;

    // Use Birdeye's OHLCV endpoint
    const url = `${BIRDEYE_API_BASE}/defi/ohlcv/pair?base_address=${baseAddress}&quote_address=${quoteAddress}&type=${timeframeMap[timeframe]}&time_from=${startTime}&time_to=${endTime}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-chain': 'solana',
      },
    });

    if (!response.ok) {
      throw new Error(`Birdeye API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.data?.items || result.data.items.length === 0) {
      // Fallback to price history if pair OHLCV not available
      return this.fetchPriceHistory(baseAddress, timeframe, barsCount);
    }

    return result.data.items.map((item: any) => ({
      time: item.unixTime,
      open: item.o,
      high: item.h,
      low: item.l,
      close: item.c,
      volume: item.v || 0,
    }));
  }

  private async fetchPriceHistory(
    tokenAddress: string,
    timeframe: TimeFrame,
    barsCount: number
  ): Promise<OHLCVData[]> {
    const timeframeMap: Record<TimeFrame, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1H',
      '4h': '4H',
      '1D': '1D',
      '1W': '1W',
    };

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - barsCount * intervalSeconds;

    const url = `${BIRDEYE_API_BASE}/defi/history_price?address=${tokenAddress}&address_type=token&type=${timeframeMap[timeframe]}&time_from=${startTime}&time_to=${endTime}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-chain': 'solana',
      },
    });

    if (!response.ok) {
      throw new Error(`Birdeye price history error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.data?.items) {
      throw new Error('No price data available');
    }

    // Convert price history to OHLCV format
    return result.data.items.map((item: any, index: number, arr: any[]) => {
      const price = item.value;
      const prevPrice = index > 0 ? arr[index - 1].value : price;
      const variation = Math.abs(price - prevPrice) * 0.5;

      return {
        time: item.unixTime,
        open: prevPrice,
        high: Math.max(price, prevPrice) + variation * Math.random(),
        low: Math.min(price, prevPrice) - variation * Math.random(),
        close: price,
        volume: 10000 + Math.random() * 100000,
      };
    });
  }

  async getCurrentPrice(pair: TradingPair): Promise<{ price: number; change24h: number }> {
    // For Stellar pairs, use the Stellar Horizon API
    if (this.isStellarPair(pair)) {
      try {
        const stellarService = getStellarHorizonService();
        return await stellarService.getCurrentPrice(pair);
      } catch (error) {
        console.warn('[ChartDataService] Stellar price API failed, using fallback:', error);
        // Fall back to calculated price
        return {
          price: getPairBasePrice(pair),
          change24h: (Math.random() - 0.5) * 5,
        };
      }
    }

    try {
      const baseAddress = pair.baseAddress || SOLANA_TOKENS[pair.base as keyof typeof SOLANA_TOKENS];

      if (!baseAddress) {
        throw new Error(`Unknown token: ${pair.base}`);
      }

      const url = `${BIRDEYE_API_BASE}/defi/price?address=${baseAddress}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'x-chain': 'solana',
        },
      });

      if (!response.ok) {
        throw new Error(`Birdeye price error: ${response.status}`);
      }

      const result = await response.json();

      return {
        price: result.data?.value || 0,
        change24h: result.data?.priceChange24h || 0,
      };
    } catch (error) {
      console.warn('Failed to fetch current price:', error);
      // Return calculated price based on pair
      return {
        price: getPairBasePrice(pair),
        change24h: (Math.random() - 0.5) * 5,
      };
    }
  }

  // Subscribe to real-time updates using polling
  subscribeToUpdates(
    pair: TradingPair,
    timeframe: TimeFrame,
    callback: (data: OHLCVData[]) => void,
    interval: number = 10000
  ): () => void {
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        const data = await this.getOHLCVData(pair, timeframe);
        callback(data);
      } catch (error) {
        console.error('Polling error:', error);
      }

      if (isActive) {
        setTimeout(poll, interval);
      }
    };

    poll();

    return () => {
      isActive = false;
    };
  }
}

export const getChartDataService = () => ChartDataService.getInstance();
