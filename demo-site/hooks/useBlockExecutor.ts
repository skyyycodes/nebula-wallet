'use client';

import { useState, useCallback } from 'react';
import { AgentBlock } from '@/types/agent-builder';
import { useQuantumWallet } from './useQuantumWallet';
import { toast } from 'sonner';

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

// Testnet known assets
const TESTNET_ASSETS: Record<string, { code: string; issuer: string | null }> = {
  XLM: { code: 'XLM', issuer: null },
  USDC: { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  yUSDC: { code: 'yUSDC', issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF' },
  AQUA: { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA' },
  SRT: { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B' },
};

// Helper to build asset query param for Horizon
function assetToParam(code: string, issuer: string | null): string {
  if (!issuer) return 'native';
  return `${code}:${issuer}`;
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  data?: Record<string, any>;
}

interface UseBlockExecutorReturn {
  /** Execute a block */
  executeBlock: (block: AgentBlock) => Promise<ExecutionResult>;
  /** Whether a block is currently executing */
  isExecuting: boolean;
  /** The ID of the currently executing block */
  executingBlockId: string | null;
  /** Last execution result */
  lastResult: ExecutionResult | null;
}

/**
 * Hook for executing agent blocks
 * Currently supports: action_transfer
 */
export function useBlockExecutor(): UseBlockExecutorReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingBlockId, setExecutingBlockId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const { isConnected, connect, provider } = useQuantumWallet();

  const executeBlock = useCallback(async (block: AgentBlock): Promise<ExecutionResult> => {
    setIsExecuting(true);
    setExecutingBlockId(block.id);
    setLastResult(null);

    try {
      // Handle different block types
      switch (block.type) {
        case 'action_transfer': {
          // Get parameters
          const destParam = block.parameters?.find(p => p.name === 'destinationAddress');
          const amountParam = block.parameters?.find(p => p.name === 'amount');
          const tokenParam = block.parameters?.find(p => p.name === 'token');

          const destination = destParam?.value as string;
          const amount = amountParam?.value as string;
          const token = tokenParam?.value as string || 'XLM';

          // Validate parameters
          if (!destination || !destination.startsWith('G')) {
            throw new Error('Invalid destination address. Must be a valid Stellar address starting with G');
          }

          if (!amount || parseFloat(amount) <= 0) {
            throw new Error('Invalid amount. Must be greater than 0');
          }

          if (token !== 'XLM') {
            throw new Error('Only XLM transfers are currently supported');
          }

          // Ensure wallet is connected
          if (!isConnected) {
            toast.info('Connecting wallet...');
            await connect();
          }

          if (!provider) {
            throw new Error('Wallet provider not available');
          }

          // Execute the transfer
          toast.info(`Sending ${amount} ${token} to ${destination.slice(0, 8)}...`);

          const result = await provider.sendXLM(destination, amount);

          const executionResult: ExecutionResult = {
            success: true,
            txHash: result.txHash,
          };

          setLastResult(executionResult);
          toast.success('Transfer successful!', {
            description: `TX: ${result.txHash.slice(0, 16)}...`,
          });

          return executionResult;
        }

        case 'action_dex_swap': {
          // DEX Swap execution using Stellar path payment (via Horizon API)
          const sourceParam = block.parameters?.find(p => p.name === 'sourceAsset');
          const destParam = block.parameters?.find(p => p.name === 'destAsset');
          const amountParam = block.parameters?.find(p => p.name === 'amount');
          const slippageParam = block.parameters?.find(p => p.name === 'slippage');

          const sourceAssetCode = (sourceParam?.value as string) || 'XLM';
          const destAssetCode = (destParam?.value as string) || 'USDC';
          const amount = (amountParam?.value as string) || '10';
          const slippage = (slippageParam?.value as number) || 0.5;

          // Validate
          if (parseFloat(amount) <= 0) {
            throw new Error('Invalid swap amount. Must be greater than 0');
          }

          if (sourceAssetCode === destAssetCode) {
            throw new Error('Source and destination assets must be different');
          }

          // Ensure wallet is connected
          if (!isConnected) {
            toast.info('Connecting wallet...');
            await connect();
          }

          if (!provider) {
            throw new Error('Wallet provider not available');
          }

          toast.info(`Finding best swap path: ${amount} ${sourceAssetCode} → ${destAssetCode}`);

          const sourceAsset = TESTNET_ASSETS[sourceAssetCode];
          const destAsset = TESTNET_ASSETS[destAssetCode];

          if (!sourceAsset || !destAsset) {
            throw new Error('Unknown asset');
          }

          // Build path query URL for strict send
          const sourceAssetParam = sourceAsset.issuer
            ? `source_asset_type=credit_alphanum4&source_asset_code=${sourceAsset.code}&source_asset_issuer=${sourceAsset.issuer}`
            : 'source_asset_type=native';
          const destAssetParam = destAsset.issuer
            ? `destination_assets=${destAsset.code}%3A${destAsset.issuer}`
            : 'destination_assets=native';

          const pathUrl = `${HORIZON_TESTNET}/paths/strict-send?${sourceAssetParam}&source_amount=${amount}&${destAssetParam}`;
          const pathResponse = await fetch(pathUrl);

          if (!pathResponse.ok) {
            throw new Error('Failed to find swap paths');
          }

          const pathData = await pathResponse.json();

          if (!pathData._embedded?.records?.length) {
            throw new Error('No swap path found. Insufficient liquidity on testnet.');
          }

          const bestPath = pathData._embedded.records[0];
          const destAmount = bestPath.destination_amount;
          const minDestAmount = (parseFloat(destAmount) * (1 - slippage / 100)).toFixed(7);

          toast.success(`Swap path found!`, {
            description: `Expected: ~${parseFloat(destAmount).toFixed(4)} ${destAssetCode} (min: ${minDestAmount})`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            txHash: 'demo-swap-' + Date.now(),
            data: {
              sourceAmount: amount,
              sourceAsset: sourceAssetCode,
              destAmount,
              destAsset: destAssetCode,
              minDestAmount,
              rate: (parseFloat(destAmount) / parseFloat(amount)).toFixed(6),
              pathLength: bestPath.path?.length || 0,
              path: bestPath.path?.map((p: any) => p.asset_code || 'XLM') || [],
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        case 'action_manage_offer': {
          // Create/update/cancel offers on Stellar DEX (demo simulation)
          const actionParam = block.parameters?.find(p => p.name === 'action');
          const sellAssetParam = block.parameters?.find(p => p.name === 'sellAsset');
          const buyAssetParam = block.parameters?.find(p => p.name === 'buyAsset');
          const amountParam = block.parameters?.find(p => p.name === 'amount');
          const priceParam = block.parameters?.find(p => p.name === 'price');

          const action = (actionParam?.value as string) || 'create';
          const sellAssetCode = (sellAssetParam?.value as string) || 'XLM';
          const buyAssetCode = (buyAssetParam?.value as string) || 'USDC';
          const amount = (amountParam?.value as string) || '100';
          const price = (priceParam?.value as string) || '0.10';

          // Validate
          if (parseFloat(amount) <= 0 || parseFloat(price) <= 0) {
            throw new Error('Amount and price must be greater than 0');
          }

          // Ensure wallet is connected
          if (!isConnected) {
            toast.info('Connecting wallet...');
            await connect();
          }

          if (!provider) {
            throw new Error('Wallet provider not available');
          }

          const userAddress = provider.getAddress();
          if (!userAddress) {
            throw new Error('No wallet address available');
          }

          toast.info(`${action === 'create' ? 'Creating' : action === 'cancel' ? 'Canceling' : 'Updating'} offer...`);

          // Simulate offer creation (in production, this would build and submit a transaction)
          await new Promise(resolve => setTimeout(resolve, 1000));

          toast.success(`Offer ${action === 'create' ? 'prepared' : action}!`, {
            description: `Sell ${amount} ${sellAssetCode} @ ${price} ${buyAssetCode} each`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            txHash: 'demo-offer-' + Date.now(),
            data: {
              action,
              sellAsset: sellAssetCode,
              buyAsset: buyAssetCode,
              amount,
              price,
              totalValue: (parseFloat(amount) * parseFloat(price)).toFixed(4),
              message: `Would ${action} offer: Sell ${amount} ${sellAssetCode} for ${buyAssetCode} at ${price}`,
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        case 'data_portfolio': {
          // Fetch portfolio balances via Horizon API
          if (!isConnected) {
            toast.info('Connecting wallet...');
            await connect();
          }

          if (!provider) {
            throw new Error('Wallet provider not available');
          }

          const userAddress = provider.getAddress();
          if (!userAddress) {
            throw new Error('No wallet address available');
          }

          toast.info('Fetching portfolio...');

          // Fetch account data
          const accountResponse = await fetch(`${HORIZON_TESTNET}/accounts/${userAddress}`);
          if (!accountResponse.ok) {
            throw new Error('Failed to fetch account. Account may not exist on testnet.');
          }
          const accountData = await accountResponse.json();

          const balances = accountData.balances.map((bal: any) => ({
            asset: bal.asset_type === 'native' ? 'XLM' : bal.asset_code,
            balance: bal.balance,
            issuer: bal.asset_issuer || null,
          }));

          // Fetch open offers
          const offersResponse = await fetch(`${HORIZON_TESTNET}/accounts/${userAddress}/offers?limit=20`);
          let offers: any[] = [];
          if (offersResponse.ok) {
            const offersData = await offersResponse.json();
            offers = (offersData._embedded?.records || []).map((offer: any) => ({
              id: offer.id,
              selling: offer.selling.asset_type === 'native' ? 'XLM' : offer.selling.asset_code,
              buying: offer.buying.asset_type === 'native' ? 'XLM' : offer.buying.asset_code,
              amount: offer.amount,
              price: offer.price,
            }));
          }

          toast.success('Portfolio loaded!', {
            description: `${balances.length} assets, ${offers.length} open offers`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            data: {
              address: userAddress,
              balances,
              offers,
              totalAssets: balances.length,
              totalOffers: offers.length,
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        case 'data_orderbook': {
          // Fetch orderbook from Stellar DEX via Horizon API
          const baseParam = block.parameters?.find(p => p.name === 'baseAsset');
          const counterParam = block.parameters?.find(p => p.name === 'counterAsset');
          const depthParam = block.parameters?.find(p => p.name === 'depth');

          const baseAssetCode = (baseParam?.value as string) || 'XLM';
          const counterAssetCode = (counterParam?.value as string) || 'USDC';
          const depth = (depthParam?.value as number) || 20;

          toast.info(`Fetching ${baseAssetCode}/${counterAssetCode} orderbook...`);

          const baseAsset = TESTNET_ASSETS[baseAssetCode];
          const counterAsset = TESTNET_ASSETS[counterAssetCode];

          if (!baseAsset || !counterAsset) {
            throw new Error('Unknown asset');
          }

          // Build orderbook query URL
          const sellingParams = baseAsset.issuer
            ? `selling_asset_type=credit_alphanum4&selling_asset_code=${baseAsset.code}&selling_asset_issuer=${baseAsset.issuer}`
            : 'selling_asset_type=native';
          const buyingParams = counterAsset.issuer
            ? `buying_asset_type=credit_alphanum4&buying_asset_code=${counterAsset.code}&buying_asset_issuer=${counterAsset.issuer}`
            : 'buying_asset_type=native';

          const orderbookUrl = `${HORIZON_TESTNET}/order_book?${sellingParams}&${buyingParams}&limit=${depth}`;
          const orderbookResponse = await fetch(orderbookUrl);

          if (!orderbookResponse.ok) {
            throw new Error('Failed to fetch orderbook');
          }

          const orderbookData = await orderbookResponse.json();

          const bids = (orderbookData.bids || []).map((b: any) => ({
            price: b.price,
            amount: b.amount,
          }));

          const asks = (orderbookData.asks || []).map((a: any) => ({
            price: a.price,
            amount: a.amount,
          }));

          const bestBid = bids[0]?.price || null;
          const bestAsk = asks[0]?.price || null;
          const spread = bestBid && bestAsk
            ? (((parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestAsk)) * 100).toFixed(3)
            : null;

          toast.success('Orderbook loaded!', {
            description: `Spread: ${spread || 'N/A'}% | ${bids.length} bids, ${asks.length} asks`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            data: {
              pair: `${baseAssetCode}/${counterAssetCode}`,
              bids,
              asks,
              bestBid,
              bestAsk,
              spread,
              midPrice: bestBid && bestAsk
                ? ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toFixed(6)
                : null,
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        case 'ai_strategy': {
          // AI Trading Strategy simulation
          const strategyParam = block.parameters?.find(p => p.name === 'strategy');
          const riskParam = block.parameters?.find(p => p.name === 'riskLevel');
          const pairParam = block.parameters?.find(p => p.name === 'tradingPair');

          const strategy = (strategyParam?.value as string) || 'momentum';
          const riskLevel = (riskParam?.value as string) || 'medium';
          const pair = (pairParam?.value as string) || 'XLM/USDC';

          toast.info(`Running AI ${strategy} strategy on ${pair}...`);

          // Simulate AI analysis (in real implementation, this would call an AI API)
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Simulated AI decision
          const signals = ['buy', 'sell', 'hold'];
          const signal = signals[Math.floor(Math.random() * signals.length)];
          const confidence = Math.floor(Math.random() * 40) + 60; // 60-100%

          const riskMultiplier = riskLevel === 'aggressive' ? 1.5 : riskLevel === 'conservative' ? 0.5 : 1;
          const positionSize = Math.floor(10 * riskMultiplier * (confidence / 100));

          const reasoning = {
            momentum: `Price ${signal === 'buy' ? 'showing upward' : signal === 'sell' ? 'showing downward' : 'stable'} momentum. RSI at ${Math.floor(Math.random() * 30) + 35}.`,
            mean_reversion: `Price ${signal === 'buy' ? 'below' : signal === 'sell' ? 'above' : 'near'} moving average. Expected reversion.`,
            breakout: `${signal === 'hold' ? 'No breakout detected' : `Potential ${signal === 'buy' ? 'bullish' : 'bearish'} breakout detected`}.`,
            sentiment: `Market sentiment is ${signal === 'buy' ? 'positive' : signal === 'sell' ? 'negative' : 'neutral'}.`,
            ml_ensemble: `ML models agree on ${signal} signal with ${confidence}% consensus.`,
          };

          toast.success(`AI Strategy: ${signal.toUpperCase()}`, {
            description: `${confidence}% confidence | ${strategy} strategy`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            data: {
              strategy,
              pair,
              signal,
              confidence,
              riskLevel,
              suggestedPositionSize: positionSize,
              reasoning: reasoning[strategy as keyof typeof reasoning],
              timestamp: new Date().toISOString(),
              indicators: {
                rsi: Math.floor(Math.random() * 100),
                macd: (Math.random() * 2 - 1).toFixed(4),
                ema20: (Math.random() * 0.05 + 0.08).toFixed(4),
                volume24h: Math.floor(Math.random() * 1000000),
              },
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        case 'data_ohlcv': {
          // Fetch OHLCV data from Stellar Horizon via API
          const pairParam = block.parameters?.find(p => p.name === 'pair');
          const timeframeParam = block.parameters?.find(p => p.name === 'timeframe');
          const limitParam = block.parameters?.find(p => p.name === 'limit');

          const pair = (pairParam?.value as string) || 'XLM/USDC';
          const timeframe = (timeframeParam?.value as string) || '1h';
          const limit = (limitParam?.value as number) || 100;

          const [baseCode, counterCode] = pair.split('/');

          toast.info(`Fetching ${pair} ${timeframe} candles...`);

          const baseAsset = TESTNET_ASSETS[baseCode];
          const counterAsset = TESTNET_ASSETS[counterCode];

          if (!baseAsset || !counterAsset) {
            throw new Error('Unknown asset pair');
          }

          // Map timeframe to Horizon resolution (in milliseconds)
          const resolutionMap: Record<string, number> = {
            '1m': 60000,
            '5m': 300000,
            '15m': 900000,
            '1h': 3600000,
            '4h': 14400000,
            '1d': 86400000,
            '1w': 604800000,
          };

          const resolution = resolutionMap[timeframe] || 3600000;
          const endTime = Date.now();
          const startTime = endTime - (resolution * limit);

          // Build trade aggregation query URL
          const baseParams = baseAsset.issuer
            ? `base_asset_type=credit_alphanum4&base_asset_code=${baseAsset.code}&base_asset_issuer=${baseAsset.issuer}`
            : 'base_asset_type=native';
          const counterParams = counterAsset.issuer
            ? `counter_asset_type=credit_alphanum4&counter_asset_code=${counterAsset.code}&counter_asset_issuer=${counterAsset.issuer}`
            : 'counter_asset_type=native';

          const tradeAggUrl = `${HORIZON_TESTNET}/trade_aggregations?${baseParams}&${counterParams}&start_time=${startTime}&end_time=${endTime}&resolution=${resolution}&limit=${limit}&order=asc`;

          const tradesResponse = await fetch(tradeAggUrl);

          if (!tradesResponse.ok) {
            throw new Error('Failed to fetch trade data');
          }

          const tradesData = await tradesResponse.json();
          const records = tradesData._embedded?.records || [];

          const candles = records.map((t: any) => ({
            timestamp: new Date(parseInt(t.timestamp)).toISOString(),
            open: t.open,
            high: t.high,
            low: t.low,
            close: t.close,
            volume: t.base_volume,
            tradeCount: t.trade_count,
          }));

          toast.success(`Loaded ${candles.length} candles`, {
            description: `${pair} ${timeframe} data`,
          });

          const executionResult: ExecutionResult = {
            success: true,
            data: {
              pair,
              timeframe,
              candles,
              candleCount: candles.length,
              latestPrice: candles[candles.length - 1]?.close || null,
            },
          };

          setLastResult(executionResult);
          return executionResult;
        }

        default:
          throw new Error(`Block type "${block.type}" is not executable`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Execution failed';

      const executionResult: ExecutionResult = {
        success: false,
        error: errorMessage,
      };

      setLastResult(executionResult);

      // Don't show toast for user rejection
      if (!errorMessage.includes('rejected')) {
        toast.error('Execution failed', {
          description: errorMessage,
        });
      }

      return executionResult;
    } finally {
      setIsExecuting(false);
      setExecutingBlockId(null);
    }
  }, [isConnected, connect, provider]);

  return {
    executeBlock,
    isExecuting,
    executingBlockId,
    lastResult,
  };
}

/**
 * Check if a block type is executable
 */
export function isBlockExecutable(blockType: string): boolean {
  const executableTypes = [
    'action_transfer',
    'action_dex_swap',
    'action_manage_offer',
    'data_portfolio',
    'data_orderbook',
    'data_ohlcv',
    'ai_strategy',
  ];
  return executableTypes.includes(blockType);
}

export default useBlockExecutor;
