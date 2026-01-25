/**
 * Token Service for Stellar Mainnet
 * 
 * Provides token metadata, price data, market info, and chart data
 * using Stellar Expert API and CoinGecko as fallback
 */

import { getNetworkManager } from '../../modules/network/NetworkManager';

// API Endpoints
const STELLAR_EXPERT_API = 'https://api.stellar.expert/explorer';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Well-known asset mappings for CoinGecko
const COINGECKO_IDS: Record<string, string> = {
  'XLM:native': 'stellar',
  'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN': 'usd-coin',
  'yXLM:GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55': 'stellar',
  'AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA': 'aquarius',
};

// Well-known asset logo URLs (hardcoded for reliability)
// These are verified URLs from token issuers' official sources
const HARDCODED_LOGOS: Record<string, string> = {
  // Native XLM
  'XLM:native': 'icons/tokens/xlm.svg',
  'XLM': 'icons/tokens/xlm.svg',
  // USDC
  'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN': 'https://www.centre.io/images/usdc/usdc-icon-86074d9d49.png',
  'USDC': 'https://www.centre.io/images/usdc/usdc-icon-86074d9d49.png',
  // yXLM
  'yXLM:GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55': 'https://ultrastellar.com/static/media/yXLM.1e1c4131.png',
  'yXLM': 'https://ultrastellar.com/static/media/yXLM.1e1c4131.png',
  // AQUA
  'AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA': 'https://aqua.network/assets/img/aqua-logo.svg',
  'AQUA': 'https://aqua.network/assets/img/aqua-logo.svg',
  // BTC (Ultra Stellar)
  'BTC:GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM': 'https://ultrastellar.com/static/media/BTC.bb94d98c.png',
  'BTC': 'https://ultrastellar.com/static/media/BTC.bb94d98c.png',
  // ETH (Ultra Stellar)
  'ETH:GBFXOHVAS43OIWNIO7XLRJAHT3BICFEOCOJNEK7K2PX5QNOFQGOPXJKO': 'https://ultrastellar.com/static/media/ETH.9e639f96.png',
  'ETH': 'https://ultrastellar.com/static/media/ETH.9e639f96.png',
  // yUSDC
  'yUSDC:GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF': 'https://ultrastellar.com/static/media/yUSDC.91e1d9f9.png',
  'yUSDC': 'https://ultrastellar.com/static/media/yUSDC.91e1d9f9.png',
  // VELO
  'VELO:GDM4RQUQQUVSKQA7S6EM7XBZP3FCGH4Q7CL6TABQ7B2BEJ5ERARM2M5M': 'https://velo.org/images/velo-logo.png',
  'VELO': 'https://velo.org/images/velo-logo.png',
  // SLT (Smartlands)
  'SLT:GCKAHUFJMH5DLXG6SWVFBHXZJLYAUELUDZEKDQNZDGKWDBLMWCV7GO2T': 'https://smartlands.io/static/logo.svg',
  'SLT': 'https://smartlands.io/static/logo.svg',
  // LSP (Lumenswap)
  'LSP:GAB7STHVD5BDH3EEYXPI3OM7PCS4V443PYB5FNT6CFGJVPDLMKDM24WK': 'https://lumenswap.io/images/lsp-logo.png',
  'LSP': 'https://lumenswap.io/images/lsp-logo.png',
};

// Local fallback icons (used when remote URLs fail)
const FALLBACK_LOGOS: Record<string, string> = {
  'XLM:native': 'icons/tokens/xlm.svg',
  'XLM': 'icons/tokens/xlm.svg',
  'USDC': 'icons/tokens/usdc.svg',
  'yXLM': 'icons/tokens/yxlm.svg',
  'AQUA': 'icons/tokens/aqua.svg',
  'SHX': 'icons/tokens/shx.svg',
  'RMT': 'icons/tokens/rmt.svg',
};

// Cache for fetched token logos (code:issuer -> imageUrl)
const logoCache: Map<string, string | null> = new Map();

// Known home domains for popular issuers
const KNOWN_HOME_DOMAINS: Record<string, string> = {
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN': 'centre.io', // USDC
  'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55': 'ultrastellar.com', // yXLM
  'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA': 'aqua.network', // AQUA
  'GDSTRSHXHGJ7ZIVRBXEYE5Q74XUVCUSEZ6EYCA6VHLQQAAX4P7MNLSHX': 'stronghold.co', // SHX
  'GCVWTTPADC5YB5AYDKJCTUYSCJ7YRH6JHSM6MGWLZMQ2BQDC5BYHTRMT': 'sureremit.co', // RMT
  'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2': 'circle.com', // EURC
  'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF': 'ultrastellar.com', // yUSDC
  'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM': 'ultrastellar.com', // BTC
  'GBFXOHVAS43OIWNIO7XLRJAHT3BICFEOCOJNEK7K2PX5QNOFQGOPXJKO': 'ultrastellar.com', // ETH
  'GDM4RQUQQUVSKQA7S6EM7XBZP3FCGH4Q7CL6TABQ7B2BEJ5ERARM2M5M': 'velo.org', // VELO
  'GCKAHUFJMH5DLXG6SWVFBHXZJLYAUELUDZEKDQNZDGKWDBLMWCV7GO2T': 'smartlands.io', // SLT
  'GAB7STHVD5BDH3EEYXPI3OM7PCS4V443PYB5FNT6CFGJVPDLMKDM24WK': 'lumenswap.io', // LSP
};

/**
 * Fetch asset icon from stellar.toml via the issuer's home domain
 * Returns the image URL or null if not found
 */
async function fetchAssetIconFromToml(code: string, issuer: string): Promise<string | null> {
  if (issuer === 'native') {
    return FALLBACK_LOGOS['XLM:native'] || null;
  }

  const cacheKey = `${code}:${issuer}`;

  // Check cache first
  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey) || null;
  }

  try {
    // Get home domain from known domains or try Stellar Expert
    let homeDomain = KNOWN_HOME_DOMAINS[issuer];

    if (!homeDomain) {
      // Try to get home domain from Stellar Expert asset info
      const networkManager = getNetworkManager();
      const config = networkManager.getConfig();
      const network = config.isTestNetwork ? 'testnet' : 'public';

      const assetResponse = await fetch(`${STELLAR_EXPERT_API}/${network}/asset/${code}-${issuer}`);
      if (assetResponse.ok) {
        const assetData = await assetResponse.json();
        homeDomain = assetData.home_domain || assetData.domain;
      }
    }

    if (!homeDomain) {
      logoCache.set(cacheKey, null);
      return null;
    }

    // Fetch stellar.toml from home domain
    const tomlUrl = `https://${homeDomain}/.well-known/stellar.toml`;
    const tomlResponse = await fetch(tomlUrl, {
      headers: { 'Accept': 'text/plain' }
    });

    if (!tomlResponse.ok) {
      logoCache.set(cacheKey, null);
      return null;
    }

    const tomlText = await tomlResponse.text();

    // Parse TOML to find the asset's image
    // Simple parsing for [[CURRENCIES]] sections
    const currencyPattern = /\[\[CURRENCIES\]\]([\s\S]*?)(?=\[\[|\[(?!\[)|$)/g;
    let match;

    while ((match = currencyPattern.exec(tomlText)) !== null) {
      const currencyBlock = match[1];

      // Check if this currency block matches our asset
      const codeMatch = currencyBlock.match(/code\s*=\s*"([^"]+)"/);
      const issuerMatch = currencyBlock.match(/issuer\s*=\s*"([^"]+)"/);

      if (codeMatch && codeMatch[1] === code &&
        issuerMatch && issuerMatch[1] === issuer) {
        // Found our asset, extract image URL
        const imageMatch = currencyBlock.match(/image\s*=\s*"([^"]+)"/);
        if (imageMatch) {
          const imageUrl = imageMatch[1];
          logoCache.set(cacheKey, imageUrl);
          return imageUrl;
        }
      }
    }

    // Also check ORG_LOGO as fallback
    const orgLogoMatch = tomlText.match(/ORG_LOGO\s*=\s*"([^"]+)"/);
    if (orgLogoMatch) {
      const orgLogo = orgLogoMatch[1];
      logoCache.set(cacheKey, orgLogo);
      return orgLogo;
    }

    logoCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error(`Failed to fetch token icon for ${code}:${issuer}:`, error);
    logoCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Get token logo URL for a given asset
 * Priority: 1) Hardcoded URLs 2) Cached stellar.toml 3) Fetch from stellar.toml 4) Local fallback
 */
export async function getTokenLogoUrlAsync(code: string, issuer: string): Promise<string | undefined> {
  const exactKey = `${code}:${issuer}`;

  // First check hardcoded logos (most reliable)
  if (HARDCODED_LOGOS[exactKey]) {
    return HARDCODED_LOGOS[exactKey];
  }
  if (HARDCODED_LOGOS[code]) {
    return HARDCODED_LOGOS[code];
  }

  // Try fetching from stellar.toml
  const fetchedLogo = await fetchAssetIconFromToml(code, issuer);
  if (fetchedLogo) {
    return fetchedLogo;
  }

  // Fallback to local icons
  if (FALLBACK_LOGOS[exactKey]) {
    return FALLBACK_LOGOS[exactKey];
  }
  return FALLBACK_LOGOS[code];
}

/**
 * Get token logo URL synchronously (for initial rendering)
 * Uses hardcoded logos first, then cache, then local fallback
 */
export function getTokenLogoUrl(code: string, issuer: string): string | undefined {
  const cacheKey = `${code}:${issuer}`;

  // First check hardcoded logos
  if (HARDCODED_LOGOS[cacheKey]) {
    return HARDCODED_LOGOS[cacheKey];
  }
  if (HARDCODED_LOGOS[code]) {
    return HARDCODED_LOGOS[code];
  }

  // Check cache from stellar.toml fetches
  if (logoCache.has(cacheKey)) {
    const cached = logoCache.get(cacheKey);
    if (cached) return cached;
  }

  // Return local fallback
  if (FALLBACK_LOGOS[cacheKey]) {
    return FALLBACK_LOGOS[cacheKey];
  }
  return FALLBACK_LOGOS[code];
}

// Export for compatibility
export const TOKEN_LOGOS = FALLBACK_LOGOS;

// Popular Stellar assets (mainnet) - verified top tokens
// These are well-known assets with verified issuer addresses
export const POPULAR_STELLAR_ASSETS = [
  { code: 'XLM', issuer: 'native', name: 'Stellar Lumens', icon: '⭐', logoUrl: FALLBACK_LOGOS['XLM:native'] },
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', name: 'USD Coin', icon: '💵' },
  { code: 'yXLM', issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55', name: 'Ultra Stellar', icon: '🌟' },
  { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA', name: 'Aquarius', icon: '💧' },
  { code: 'SHX', issuer: 'GDSTRSHXHGJ7ZIVRBXEYE5Q74XUVCUSEZ6EYCA6VHLQQAAX4P7MNLSHX', name: 'Stronghold SHX', icon: '🏦' },
  { code: 'yUSDC', issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF', name: 'yUSDC', icon: '💰' },
  { code: 'BTC', issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM', name: 'Bitcoin (Ultra)', icon: '₿' },
  { code: 'ETH', issuer: 'GDLGAWYQ75JVOOXPCJBGE23KSEVWXRCMEHGNTDZNTPUWZPHLNE5MYQRA', name: 'Ethereum (Ultra)', icon: 'Ξ' },
  { code: 'MOBI', issuer: 'GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH', name: 'Mobius', icon: '🔵' },
  { code: 'DOGET', issuer: 'GDOEVDDBU6OBWKL7VHDAOKD77UP4DKHQYKOKJJT5PR3WRDBTX35HUEUX', name: 'Doge Token', icon: '🐕' },
];

export interface TokenInfo {
  code: string;
  issuer: string;
  name: string;
  icon?: string;
  domain?: string;
  description?: string;
  decimals: number;
  verified: boolean;
}

export interface TokenPrice {
  usd: number;
  usdChange24h: number;
  usdChange7d?: number;
  lastUpdated: number;
}

export interface MarketInfo {
  marketCap: number;
  totalSupply: number;
  circulatingSupply: number;
  volume24h: number;
  volumeChange24h?: number;
  holders?: number;
  trades24h?: number;
}

export interface PricePoint {
  time: number; // Unix timestamp
  value: number;
}

export interface TokenTransaction {
  id: string;
  type: 'sent' | 'received' | 'swapped';
  amount: string;
  asset: string;
  counterparty: string;
  timestamp: string;
  hash: string;
}

class TokenService {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private cacheDuration = 60000; // 1 minute cache

  /**
   * Get asset identifier string
   */
  private getAssetId(code: string, issuer: string): string {
    if (code === 'XLM' && issuer === 'native') return 'XLM';
    return `${code}-${issuer}`;
  }

  /**
   * Check cache and return if valid
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Set cache with expiry
   */
  private setCache(key: string, data: any, duration?: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + (duration || this.cacheDuration),
    });
  }

  /**
   * Get network prefix for Stellar Expert API
   */
  private getNetworkPrefix(): string {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    return config.type === 'testnet' ? 'testnet' : 'public';
  }

  /**
   * Check if currently on mainnet
   */
  isMainnet(): boolean {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    return config.type !== 'testnet';
  }

  /**
   * Get token metadata from Stellar Expert
   */
  async getTokenInfo(code: string, issuer: string): Promise<TokenInfo | null> {
    const cacheKey = `info:${this.getAssetId(code, issuer)}`;
    const cached = this.getFromCache<TokenInfo>(cacheKey);
    if (cached) return cached;

    try {
      // Handle native XLM
      if (code === 'XLM' && issuer === 'native') {
        const info: TokenInfo = {
          code: 'XLM',
          issuer: 'native',
          name: 'Stellar Lumens',
          description: 'The native cryptocurrency of the Stellar network',
          decimals: 7,
          verified: true,
          icon: '⭐',
        };
        this.setCache(cacheKey, info);
        return info;
      }

      const network = this.getNetworkPrefix();
      const response = await fetch(
        `${STELLAR_EXPERT_API}/${network}/asset/${code}-${issuer}`
      );

      if (!response.ok) {
        throw new Error('Asset not found');
      }

      const data = await response.json();
      const info: TokenInfo = {
        code: data.asset?.split('-')[0] || code,
        issuer,
        name: data.toml?.name || code,
        domain: data.toml?.domain,
        description: data.toml?.desc,
        decimals: 7,
        verified: data.rating?.average > 3,
        icon: data.toml?.image,
      };

      this.setCache(cacheKey, info);
      return info;
    } catch (error) {
      console.error('Failed to fetch token info:', error);
      // Return basic info as fallback
      return {
        code,
        issuer,
        name: code,
        decimals: 7,
        verified: false,
      };
    }
  }

  /**
   * Get token price from Stellar Expert, CoinGecko, or Horizon SDEX
   */
  async getTokenPrice(code: string, issuer: string): Promise<TokenPrice | null> {
    const cacheKey = `price:${this.getAssetId(code, issuer)}`;
    const cached = this.getFromCache<TokenPrice>(cacheKey);
    if (cached) return cached;

    try {
      // Try CoinGecko first for well-known assets
      const geckoId = COINGECKO_IDS[`${code}:${issuer}`];
      if (geckoId) {
        const price = await this.getCoinGeckoPrice(geckoId);
        if (price) {
          this.setCache(cacheKey, price);
          return price;
        }
      }

      // Try Stellar Expert (may not work on testnet)
      const network = this.getNetworkPrefix();
      const assetParam = code === 'XLM' && issuer === 'native'
        ? 'XLM'
        : `${code}-${issuer}`;

      try {
        const response = await fetch(
          `${STELLAR_EXPERT_API}/${network}/asset/${assetParam}/price`
        );

        if (response.ok) {
          const data = await response.json();
          const price: TokenPrice = {
            usd: data.price || 0,
            usdChange24h: data.change24h || 0,
            lastUpdated: Date.now(),
          };
          this.setCache(cacheKey, price);
          return price;
        }
      } catch (expertError) {
        // Stellar Expert failed, continue to SDEX fallback
        console.log('Stellar Expert price unavailable, trying SDEX');
      }

      // Fallback to Horizon SDEX orderbook for testnet
      const sdexPrice = await this.getSDEXPrice(code, issuer);
      if (sdexPrice) {
        this.setCache(cacheKey, sdexPrice);
        return sdexPrice;
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch token price:', error);
      return null;
    }
  }

  /**
   * Get price from Horizon SDEX orderbook (works on testnet)
   */
  private async getSDEXPrice(code: string, issuer: string): Promise<TokenPrice | null> {
    try {
      const networkManager = getNetworkManager();
      const horizonUrl = networkManager.getConfig().horizonUrl;

      // For XLM, get price vs USDC
      // For other assets, get price vs XLM then convert
      if (code === 'XLM' && (issuer === 'native' || !issuer)) {
        // XLM vs USDC - use testnet USDC issuer
        const usdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
        const url = `${horizonUrl}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${usdcIssuer}`;
        
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const orderbook = await response.json();
        
        // Best bid = what you get when selling XLM for USDC
        if (orderbook.bids && orderbook.bids.length > 0) {
          const price = parseFloat(orderbook.bids[0].price);
          return {
            usd: price,
            usdChange24h: 0, // SDEX doesn't provide historical data
            lastUpdated: Date.now(),
          };
        }
      } else if (code === 'USDC') {
        // USDC is roughly $1
        return {
          usd: 1.0,
          usdChange24h: 0,
          lastUpdated: Date.now(),
        };
      } else {
        // Other assets: get price vs XLM, then multiply by XLM price
        const xlmPrice = await this.getSDEXPrice('XLM', 'native');
        if (!xlmPrice) return null;

        // Get asset vs XLM orderbook
        const assetType = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
        const url = `${horizonUrl}/order_book?selling_asset_type=${assetType}&selling_asset_code=${code}&selling_asset_issuer=${issuer}&buying_asset_type=native`;
        
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const orderbook = await response.json();
        
        if (orderbook.bids && orderbook.bids.length > 0) {
          const priceInXLM = parseFloat(orderbook.bids[0].price);
          return {
            usd: priceInXLM * xlmPrice.usd,
            usdChange24h: 0,
            lastUpdated: Date.now(),
          };
        }
      }

      return null;
    } catch (error) {
      console.error('SDEX price fetch failed:', error);
      return null;
    }
  }

  /**
   * Get price from CoinGecko
   */
  private async getCoinGeckoPrice(coinId: string): Promise<TokenPrice | null> {
    try {
      const response = await fetch(
        `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true`
      );

      if (!response.ok) {
        throw new Error('CoinGecko price not found');
      }

      const data = await response.json();
      const coinData = data[coinId];

      if (!coinData) return null;

      return {
        usd: coinData.usd || 0,
        usdChange24h: coinData.usd_24h_change || 0,
        usdChange7d: coinData.usd_7d_change,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      console.error('CoinGecko price fetch failed:', error);
      return null;
    }
  }

  /**
   * Get market info for a token
   */
  async getMarketInfo(code: string, issuer: string): Promise<MarketInfo | null> {
    const cacheKey = `market:${this.getAssetId(code, issuer)}`;
    const cached = this.getFromCache<MarketInfo>(cacheKey);
    if (cached) return cached;

    try {
      // Try CoinGecko first for detailed market data
      const geckoId = COINGECKO_IDS[`${code}:${issuer}`];
      if (geckoId) {
        const marketInfo = await this.getCoinGeckoMarket(geckoId);
        if (marketInfo) {
          this.setCache(cacheKey, marketInfo);
          return marketInfo;
        }
      }

      // Fall back to Stellar Expert
      const network = this.getNetworkPrefix();
      const assetParam = code === 'XLM' && issuer === 'native'
        ? 'XLM'
        : `${code}-${issuer}`;

      const response = await fetch(
        `${STELLAR_EXPERT_API}/${network}/asset/${assetParam}`
      );

      if (!response.ok) {
        throw new Error('Market info not found');
      }

      const data = await response.json();
      const marketInfo: MarketInfo = {
        marketCap: data.supply?.circulating * (data.price || 0) || 0,
        totalSupply: data.supply?.total || 0,
        circulatingSupply: data.supply?.circulating || 0,
        volume24h: data.volume24h?.USD || 0,
        holders: data.trustlines?.authorized || 0,
        trades24h: data.trades24h || 0,
      };

      this.setCache(cacheKey, marketInfo);
      return marketInfo;
    } catch (error) {
      console.error('Failed to fetch market info:', error);
      return null;
    }
  }

  /**
   * Get market data from CoinGecko
   */
  private async getCoinGeckoMarket(coinId: string): Promise<MarketInfo | null> {
    try {
      const response = await fetch(
        `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );

      if (!response.ok) {
        throw new Error('CoinGecko market data not found');
      }

      const data = await response.json();
      const marketData = data.market_data;

      if (!marketData) return null;

      return {
        marketCap: marketData.market_cap?.usd || 0,
        totalSupply: marketData.total_supply || 0,
        circulatingSupply: marketData.circulating_supply || 0,
        volume24h: marketData.total_volume?.usd || 0,
        volumeChange24h: marketData.total_volume_24h_change || 0,
      };
    } catch (error) {
      console.error('CoinGecko market fetch failed:', error);
      return null;
    }
  }

  /**
   * Get price history for charts
   */
  async getPriceHistory(
    code: string,
    issuer: string,
    timeframe: '1H' | '1D' | '1W' | '1M' | 'YTD' | 'ALL'
  ): Promise<PricePoint[]> {
    const cacheKey = `history:${this.getAssetId(code, issuer)}:${timeframe}`;
    const cached = this.getFromCache<PricePoint[]>(cacheKey);
    if (cached) return cached;

    try {
      // Map timeframe to days for CoinGecko
      const daysMap: Record<string, number | 'max'> = {
        '1H': 1,
        '1D': 1,
        '1W': 7,
        '1M': 30,
        'YTD': 365,
        'ALL': 'max',
      };

      // Try CoinGecko first
      const geckoId = COINGECKO_IDS[`${code}:${issuer}`];
      if (geckoId) {
        const days = daysMap[timeframe];
        const response = await fetch(
          `${COINGECKO_API}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`
        );

        if (response.ok) {
          const data = await response.json();
          const prices: PricePoint[] = data.prices.map((p: [number, number]) => ({
            time: Math.floor(p[0] / 1000),
            value: p[1],
          }));

          // For 1H, filter to last hour
          if (timeframe === '1H') {
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            const filtered = prices.filter(p => p.time * 1000 > oneHourAgo);
            this.setCache(cacheKey, filtered, 30000); // 30 second cache for 1H
            return filtered;
          }

          this.setCache(cacheKey, prices);
          return prices;
        }
      }

      // Fall back to Stellar Expert
      const network = this.getNetworkPrefix();
      const assetParam = code === 'XLM' && issuer === 'native'
        ? 'XLM'
        : `${code}-${issuer}`;

      const resolutionMap: Record<string, number> = {
        '1H': 60000,      // 1 minute
        '1D': 3600000,    // 1 hour
        '1W': 86400000,   // 1 day
        '1M': 86400000,   // 1 day
        'YTD': 604800000, // 1 week
        'ALL': 2592000000, // 1 month
      };

      const now = Date.now();
      const fromMap: Record<string, number> = {
        '1H': now - 60 * 60 * 1000,
        '1D': now - 24 * 60 * 60 * 1000,
        '1W': now - 7 * 24 * 60 * 60 * 1000,
        '1M': now - 30 * 24 * 60 * 60 * 1000,
        'YTD': new Date(new Date().getFullYear(), 0, 1).getTime(),
        'ALL': 0,
      };

      const response = await fetch(
        `${STELLAR_EXPERT_API}/${network}/asset/${assetParam}/price/history?resolution=${resolutionMap[timeframe]}&from=${fromMap[timeframe]}&to=${now}`
      );

      if (!response.ok) {
        throw new Error('Price history not found');
      }

      const data = await response.json();
      const prices: PricePoint[] = (data.records || []).map((r: any) => ({
        time: r.ts / 1000,
        value: r.price || 0,
      }));

      this.setCache(cacheKey, prices);
      return prices;
    } catch (error) {
      console.error('Failed to fetch price history:', error);
      // Return mock data for demo
      return this.generateMockPriceHistory(timeframe);
    }
  }

  /**
   * Generate mock price history for demo/fallback
   */
  private generateMockPriceHistory(timeframe: string): PricePoint[] {
    const now = Math.floor(Date.now() / 1000);
    const points: PricePoint[] = [];

    const countMap: Record<string, number> = {
      '1H': 60,
      '1D': 24,
      '1W': 7 * 24,
      '1M': 30,
      'YTD': 365,
      'ALL': 365,
    };

    const intervalMap: Record<string, number> = {
      '1H': 60,
      '1D': 3600,
      '1W': 3600,
      '1M': 86400,
      'YTD': 86400,
      'ALL': 86400,
    };

    const count = countMap[timeframe] || 24;
    const interval = intervalMap[timeframe] || 3600;
    let price = 0.12; // Starting price for XLM

    for (let i = count; i >= 0; i--) {
      price = price * (1 + (Math.random() - 0.5) * 0.02); // Random walk
      points.push({
        time: now - i * interval,
        value: price,
      });
    }

    return points;
  }

  /**
   * Get transaction history for a specific asset
   */
  async getTokenTransactions(
    publicKey: string,
    code: string,
    issuer: string,
    limit: number = 20
  ): Promise<TokenTransaction[]> {
    try {
      const networkManager = getNetworkManager();
      const server = networkManager.getServer();

      // Fetch payments for the account
      const paymentsResponse = await server
        .payments()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit * 2) // Fetch more to filter by asset
        .call();

      const transactions: TokenTransaction[] = [];

      for (const payment of paymentsResponse.records) {
        // Only process payment operations
        if (payment.type !== 'payment' && payment.type !== 'create_account') {
          continue;
        }

        // Filter by asset
        const isNative = code === 'XLM' && issuer === 'native';
        if (payment.type === 'payment') {
          const paymentOp = payment as any;
          if (isNative && paymentOp.asset_type !== 'native') continue;
          if (!isNative && (paymentOp.asset_code !== code || paymentOp.asset_issuer !== issuer)) continue;
        } else if (payment.type === 'create_account' && !isNative) {
          continue; // create_account only applies to XLM
        }

        const isReceived = (payment as any).to === publicKey;
        const counterparty = isReceived
          ? (payment as any).from || (payment as any).funder
          : (payment as any).to;

        transactions.push({
          id: payment.id,
          type: isReceived ? 'received' : 'sent',
          amount: (payment as any).amount || (payment as any).starting_balance || '0',
          asset: code,
          counterparty: counterparty || 'Unknown',
          timestamp: payment.created_at,
          hash: payment.transaction_hash,
        });

        if (transactions.length >= limit) break;
      }

      return transactions;
    } catch (error) {
      console.error('Failed to fetch token transactions:', error);
      return [];
    }
  }

  /**
   * Get user's balance for a specific token
   */
  async getTokenBalance(publicKey: string, code: string, issuer: string): Promise<string> {
    try {
      const networkManager = getNetworkManager();
      const server = networkManager.getServer();
      const account = await server.loadAccount(publicKey);

      if (code === 'XLM' && issuer === 'native') {
        const xlmBalance = account.balances.find(
          (b: any) => b.asset_type === 'native'
        );
        return xlmBalance?.balance || '0';
      }

      const tokenBalance = account.balances.find(
        (b: any) => b.asset_code === code && b.asset_issuer === issuer
      );
      return tokenBalance?.balance || '0';
    } catch (error) {
      console.error('Failed to fetch token balance:', error);
      return '0';
    }
  }

  /**
   * Get all token balances for an account
   */
  async getAllBalances(publicKey: string): Promise<Array<{
    code: string;
    issuer: string;
    balance: string;
    name?: string;
  }>> {
    try {
      const networkManager = getNetworkManager();
      const server = networkManager.getServer();
      const account = await server.loadAccount(publicKey);

      const balances: Array<{
        code: string;
        issuer: string;
        balance: string;
        name?: string;
      }> = [];

      for (const b of account.balances) {
        if ((b as any).asset_type === 'native') {
          balances.push({
            code: 'XLM',
            issuer: 'native',
            balance: (b as any).balance,
            name: 'Stellar Lumens',
          });
        } else {
          const assetBalance = b as any;
          const popularAsset = POPULAR_STELLAR_ASSETS.find(
            a => a.code === assetBalance.asset_code && a.issuer === assetBalance.asset_issuer
          );
          balances.push({
            code: assetBalance.asset_code,
            issuer: assetBalance.asset_issuer,
            balance: assetBalance.balance,
            name: popularAsset?.name,
          });
        }
      }

      return balances;
    } catch (error) {
      console.error('Failed to fetch balances:', error);
      return [];
    }
  }

  /**
   * Search for tokens by name or code
   */
  async searchTokens(query: string, limit: number = 10): Promise<TokenInfo[]> {
    try {
      const network = this.getNetworkPrefix();
      const response = await fetch(
        `${STELLAR_EXPERT_API}/${network}/asset?search=${encodeURIComponent(query)}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      return (data._embedded?.records || []).map((r: any) => ({
        code: r.asset.split('-')[0],
        issuer: r.asset.split('-')[1] || 'native',
        name: r.toml?.name || r.asset.split('-')[0],
        domain: r.toml?.domain,
        decimals: 7,
        verified: r.rating?.average > 3,
      }));
    } catch (error) {
      console.error('Token search failed:', error);
      return [];
    }
  }
}

// Singleton instance
export const tokenService = new TokenService();
