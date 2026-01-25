/**
 * useDeFi Hook - DeFi and DEX Aggregator functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { getDexAggregator, getSwapQuote } from '../../modules/dex/DexAggregator';
import { DexSource, AssetId, AggregatedQuote } from '../../modules/dex/types';

export interface TokenDisplay {
  code: string;
  issuer: string | null;
  name: string;
  icon?: string;
  balance?: string;
}

export interface DeFiState {
  isLoading: boolean;
  error: string | null;
  quote: AggregatedQuote | null;
  availableSources: DexSource[];
}

export interface UseDeFiOptions {
  network?: 'testnet' | 'mainnet';
  autoRefreshInterval?: number; // ms
}

// Mainnet tokens
export const MAINNET_TOKENS: TokenDisplay[] = [
  {
    code: 'XLM',
    issuer: null,
    name: 'Stellar Lumens',
  },
  {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'USD Coin',
  },
  {
    code: 'AQUA',
    issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    name: 'Aquarius',
  },
  {
    code: 'yXLM',
    issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
    name: 'Ultra Stellar',
  },
];

// Testnet tokens
export const TESTNET_TOKENS: TokenDisplay[] = [
  {
    code: 'XLM',
    issuer: null,
    name: 'Stellar Lumens (Testnet)',
  },
  {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    name: 'USD Coin (Testnet)',
  },
];

export function useDeFi(options: UseDeFiOptions = {}) {
  const { network = 'testnet', autoRefreshInterval } = options;

  const [state, setState] = useState<DeFiState>({
    isLoading: false,
    error: null,
    quote: null,
    availableSources: [],
  });

  // Get available DEX sources
  const refreshSources = useCallback(() => {
    try {
      const aggregator = getDexAggregator();
      const sources = aggregator.getAvailableSources();
      setState(prev => ({ ...prev, availableSources: sources }));
    } catch (error) {
      console.error('Failed to get DEX sources:', error);
    }
  }, []);

  // Initialize sources on mount
  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  // Get swap quote
  const getQuote = useCallback(async (
    sourceAsset: AssetId,
    destAsset: AssetId,
    amount: string,
    swapType: 'exactIn' | 'exactOut' = 'exactIn',
    slippageTolerance: number = 0.005
  ): Promise<AggregatedQuote | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const quote = await getSwapQuote(
        sourceAsset,
        destAsset,
        amount,
        swapType,
        slippageTolerance
      );

      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        quote,
        error: null 
      }));

      return quote;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get quote';
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMessage,
        quote: null 
      }));
      return null;
    }
  }, []);

  // Get tokens based on network
  const getTokens = useCallback((): TokenDisplay[] => {
    return network === 'mainnet' ? MAINNET_TOKENS : TESTNET_TOKENS;
  }, [network]);

  // Check if pair is tradeable
  const isPairTradeable = useCallback(async (
    sourceAsset: AssetId,
    destAsset: AssetId
  ): Promise<boolean> => {
    try {
      const aggregator = getDexAggregator();
      return await aggregator.isPairTradeable(sourceAsset, destAsset);
    } catch (error) {
      console.error('Failed to check pair:', error);
      return false;
    }
  }, []);

  // Enable/disable a DEX source
  const setSourceEnabled = useCallback((source: DexSource, enabled: boolean) => {
    try {
      const aggregator = getDexAggregator();
      aggregator.setSourceEnabled(source, enabled);
      refreshSources();
    } catch (error) {
      console.error('Failed to update source:', error);
    }
  }, [refreshSources]);

  // Clear quote
  const clearQuote = useCallback(() => {
    setState(prev => ({ ...prev, quote: null, error: null }));
  }, []);

  // Auto-refresh quote (optional)
  useEffect(() => {
    if (autoRefreshInterval && state.quote) {
      const interval = setInterval(() => {
        const { request } = state.quote!;
        getQuote(
          request.sourceAsset,
          request.destAsset,
          request.amount,
          request.swapType,
          request.slippageTolerance
        );
      }, autoRefreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, state.quote, getQuote]);

  return {
    ...state,
    getQuote,
    getTokens,
    isPairTradeable,
    setSourceEnabled,
    clearQuote,
    refreshSources,
  };
}

export type { DexSource, AssetId, AggregatedQuote };
