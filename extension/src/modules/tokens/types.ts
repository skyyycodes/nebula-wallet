// Token Types
export interface StellarAsset { code: string; issuer: string | null; type: 'native' | 'credit_alphanum4' | 'credit_alphanum12'; }
export interface TokenInfo { asset: StellarAsset; name: string; symbol: string; decimals: number; price?: number; verified: boolean; }
export const POPULAR_TOKENS = [{ code: 'XLM' }, { code: 'USDC' }];
