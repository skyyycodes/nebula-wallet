export interface OHLCVData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeBar {
  time: number;
  value: number;
  color: string;
}

export type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export interface TradingPair {
  base: string;
  quote: string;
  baseAddress?: string;
  quoteAddress?: string;
}

export interface ChartConfig {
  pair: TradingPair;
  timeframe: TimeFrame;
}

export const TIMEFRAME_SECONDS: Record<TimeFrame, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
};

// Stellar Network Token Identifiers
export const STELLAR_TOKENS = {
  XLM: 'native', // Native Stellar Lumens
  USDC: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Circle USDC on Stellar
  SRT: 'SRT:GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
  yUSDC: 'yUSDC:GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF', // yUSDC
  AQUA: 'AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA', // Aquarius
};

// Solana Mainnet Token Addresses (for reference)
export const SOLANA_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

export const POPULAR_PAIRS: TradingPair[] = [
  { base: 'XLM', quote: 'USDC', baseAddress: STELLAR_TOKENS.XLM, quoteAddress: STELLAR_TOKENS.USDC },
  { base: 'USDC', quote: 'XLM', baseAddress: STELLAR_TOKENS.USDC, quoteAddress: STELLAR_TOKENS.XLM },
];
