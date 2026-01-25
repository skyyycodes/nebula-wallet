import { useState, useCallback } from 'react';
import { AgentBlock } from '../types/agent-builder';

// Horizon URL for testnet
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Known testnet assets
const TESTNET_ASSETS: Record<string, { code: string; issuer: string | null }> = {
  XLM: { code: 'XLM', issuer: null },
  USDC: { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  yUSDC: { code: 'yUSDC', issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF' },
  AQUA: { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA' },
  SRT: { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B' },
};

// Block types that can be executed
const EXECUTABLE_BLOCK_TYPES = [
  'action_transfer',
  'action_multi_send',
  'action_dex_swap',
  'action_swap',
  'action_buy',
  'action_sell',
  'data_portfolio',
  'data_orderbook',
  'data_ohlcv',
];

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  data?: any;
  error?: string;
  explorerUrl?: string;
}

interface ExtensionResponse {
  success: boolean;
  data?: any;
  error?: string;
}

async function sendMessage(type: string, payload?: unknown): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

export function isBlockExecutable(blockType: string): boolean {
  return EXECUTABLE_BLOCK_TYPES.includes(blockType);
}

export function useBlockExecutor() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingBlockId, setExecutingBlockId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);

  const executeBlock = useCallback(async (block: AgentBlock): Promise<ExecutionResult> => {
    setIsExecuting(true);
    setExecutingBlockId(block.id);
    setLastResult(null);

    try {
      let result: ExecutionResult;

      switch (block.type) {
        case 'action_transfer': {
          result = await executeTransfer(block);
          break;
        }

        case 'action_multi_send': {
          result = await executeMultiSend(block);
          break;
        }

        case 'action_dex_swap':
        case 'action_swap':
        case 'action_buy':
        case 'action_sell': {
          result = await executeSwap(block);
          break;
        }

        case 'data_portfolio': {
          result = await fetchPortfolio(block);
          break;
        }

        case 'data_orderbook': {
          result = await fetchOrderbook(block);
          break;
        }

        case 'data_ohlcv': {
          result = await fetchOHLCV(block);
          break;
        }

        default:
          result = {
            success: false,
            error: `Block type "${block.type}" is not executable`,
          };
      }

      setLastResult(result);
      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      setLastResult(errorResult);
      return errorResult;
    } finally {
      setIsExecuting(false);
      setExecutingBlockId(null);
    }
  }, []);

  return {
    executeBlock,
    isExecuting,
    executingBlockId,
    lastResult,
  };
}

// Export standalone execution functions for chat commands
export interface ChatExecutionRequest {
  action: 'swap' | 'transfer' | 'portfolio';
  params: {
    fromAsset?: string;
    toAsset?: string;
    amount?: string;
    slippage?: number;
    destination?: string;
  };
}

export async function executeChatCommand(request: ChatExecutionRequest): Promise<ExecutionResult> {
  switch (request.action) {
    case 'swap': {
      // Create a mock block for the swap executor
      const mockBlock: AgentBlock = {
        id: 'chat-swap',
        type: 'action_swap',
        label: 'Chat Swap',
        position: { x: 0, y: 0 },
        data: {},
        parameters: [
          { id: 'from', name: 'fromAsset', type: 'text', value: request.params.fromAsset || 'XLM' },
          { id: 'to', name: 'toAsset', type: 'text', value: request.params.toAsset || 'USDC' },
          { id: 'amount', name: 'amount', type: 'number', value: request.params.amount || '10' },
          { id: 'slippage', name: 'slippage', type: 'number', value: request.params.slippage || 3 },
        ],
      };
      return executeSwap(mockBlock);
    }

    case 'transfer': {
      const mockBlock: AgentBlock = {
        id: 'chat-transfer',
        type: 'action_transfer',
        label: 'Chat Transfer',
        position: { x: 0, y: 0 },
        data: {},
        parameters: [
          { id: 'dest', name: 'destination', type: 'text', value: request.params.destination || '' },
          { id: 'amount', name: 'amount', type: 'number', value: request.params.amount || '1' },
        ],
      };
      return executeTransfer(mockBlock);
    }

    case 'portfolio': {
      const mockBlock: AgentBlock = {
        id: 'chat-portfolio',
        type: 'data_portfolio',
        label: 'Chat Portfolio',
        position: { x: 0, y: 0 },
        data: {},
        parameters: [],
      };
      return fetchPortfolio(mockBlock);
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${request.action}`,
      };
  }
}

// ============ Execution Handlers ============

async function executeTransfer(block: AgentBlock): Promise<ExecutionResult> {
  const destinationParam = block.parameters?.find(p => p.name === 'destinationAddress' || p.name === 'destination');
  const amountParam = block.parameters?.find(p => p.name === 'amount');

  const destination = destinationParam?.value as string;
  const amount = amountParam?.value as string;

  if (!destination || !amount) {
    return {
      success: false,
      error: 'Missing required parameters: destination address and amount',
    };
  }

  // Validate Stellar address format
  if (!destination.startsWith('G') || destination.length !== 56) {
    return {
      success: false,
      error: 'Invalid Stellar address format',
    };
  }

  // Validate amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return {
      success: false,
      error: 'Amount must be a positive number',
    };
  }

  // Send XLM via background script (quantum-safe)
  const response = await sendMessage('SEND_XLM', {
    to: destination,
    amount: amount,
  });

  if (!response.success) {
    return {
      success: false,
      error: response.error || 'Failed to send XLM',
    };
  }

  const txHash = response.data?.txHash;
  return {
    success: true,
    txHash,
    explorerUrl: txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : undefined,
    data: {
      destination,
      amount,
      message: `Sent ${amount} XLM to ${destination.slice(0, 8)}...`,
    },
  };
}

async function executeMultiSend(block: AgentBlock): Promise<ExecutionResult> {
  // Get recipients parameter (can be string or array)
  const recipientsParam = block.parameters?.find(p => p.name === 'recipients');
  const memoParam = block.parameters?.find(p => p.name === 'memo');

  const recipientsRaw = recipientsParam?.value;
  const memo = (memoParam?.value as string) || '';

  let recipients: Array<{ address: string; amount: string }> = [];

  // Parse recipients - handle comma-separated string format "GADDR1:10,GADDR2:20"
  if (typeof recipientsRaw === 'string' && recipientsRaw.trim()) {
    const parts = recipientsRaw.split(',').map(s => s.trim()).filter(Boolean);
    recipients = parts.map(part => {
      const [address, amount] = part.split(':').map(s => s.trim());
      return { address, amount: amount || '1' };
    });
  } else if (Array.isArray(recipientsRaw)) {
    recipients = recipientsRaw.map((r: any) => ({
      address: r.address || r.destination || r,
      amount: r.amount || '1',
    }));
  }

  if (recipients.length === 0) {
    return {
      success: false,
      error: 'No recipients specified. Use format: GADDR1:10,GADDR2:20',
    };
  }

  // Validate all addresses and amounts
  for (let i = 0; i < recipients.length; i++) {
    const { address, amount } = recipients[i];
    if (!address || !address.startsWith('G') || address.length !== 56) {
      return {
        success: false,
        error: `Invalid Stellar address at position ${i + 1}: "${address}"`,
      };
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return {
        success: false,
        error: `Invalid amount at position ${i + 1}: "${amount}"`,
      };
    }
  }

  // Execute via background script
  const response = await sendMessage('EXECUTE_MULTI_SEND', {
    recipients,
    memo,
  });

  if (!response.success) {
    return {
      success: false,
      error: response.error || 'Multi-send failed',
    };
  }

  const txHash = response.data?.txHash;
  const totalAmount = recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0);

  return {
    success: true,
    txHash,
    explorerUrl: txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : undefined,
    data: {
      recipients: recipients.length,
      totalAmount,
      message: `Sent ${totalAmount} XLM to ${recipients.length} recipients`,
    },
  };
}

async function executeSwap(block: AgentBlock): Promise<ExecutionResult> {
  // Get parameters based on block type
  let sourceAssetCode: string;
  let destAssetCode: string;
  let amount: string;
  let slippage: number;

  if (block.type === 'action_buy') {
    // Buy: swap from quote asset (USDC) to target asset
    const targetAssetParam = block.parameters?.find(p => p.name === 'asset' || p.name === 'targetAsset');
    const amountParam = block.parameters?.find(p => p.name === 'amount' || p.name === 'quoteAmount');
    const slippageParam = block.parameters?.find(p => p.name === 'slippage');

    sourceAssetCode = 'USDC';
    destAssetCode = (targetAssetParam?.value as string) || 'XLM';
    amount = (amountParam?.value as string) || '10';
    slippage = (slippageParam?.value as number) || 3;
  } else if (block.type === 'action_sell') {
    // Sell: swap from target asset to quote asset (USDC)
    const targetAssetParam = block.parameters?.find(p => p.name === 'asset' || p.name === 'targetAsset');
    const amountParam = block.parameters?.find(p => p.name === 'amount');
    const slippageParam = block.parameters?.find(p => p.name === 'slippage');

    sourceAssetCode = (targetAssetParam?.value as string) || 'XLM';
    destAssetCode = 'USDC';
    amount = (amountParam?.value as string) || '10';
    slippage = (slippageParam?.value as number) || 3;
  } else {
    // Regular swap
    const sourceParam = block.parameters?.find(p => p.name === 'sourceAsset' || p.name === 'fromAsset');
    const destParam = block.parameters?.find(p => p.name === 'destAsset' || p.name === 'toAsset');
    const amountParam = block.parameters?.find(p => p.name === 'amount');
    const slippageParam = block.parameters?.find(p => p.name === 'slippage');

    sourceAssetCode = (sourceParam?.value as string) || 'XLM';
    destAssetCode = (destParam?.value as string) || 'USDC';
    amount = (amountParam?.value as string) || '10';
    slippage = (slippageParam?.value as number) || 3;
  }

  // Get asset details
  const sourceAsset = TESTNET_ASSETS[sourceAssetCode] || { code: sourceAssetCode, issuer: null };
  const destAsset = TESTNET_ASSETS[destAssetCode] || { code: destAssetCode, issuer: null };

  // Validate amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return {
      success: false,
      error: 'Amount must be a positive number',
    };
  }

  // Get wallet address for path finding
  const walletResponse = await sendMessage('GET_WALLET');
  if (!walletResponse.success || !walletResponse.data) {
    return {
      success: false,
      error: 'Wallet not connected. Please connect your wallet first.',
    };
  }

  const walletAddress = walletResponse.data.address;

  // Find swap path via Horizon strict-send endpoint
  // Format: destination_assets=CODE:ISSUER or native
  const destAssetParam = destAsset.issuer
    ? `${destAsset.code}:${destAsset.issuer}`
    : 'native';

  // Build path URL - use destination_assets (not destination_account)
  let pathUrl = `${HORIZON_URL}/paths/strict-send?source_asset_type=${sourceAsset.issuer ? 'credit_alphanum4' : 'native'}`;
  if (sourceAsset.issuer) {
    pathUrl += `&source_asset_code=${sourceAsset.code}&source_asset_issuer=${sourceAsset.issuer}`;
  }
  pathUrl += `&source_amount=${amount}&destination_assets=${destAssetParam}`;

  let pathResponse;
  try {
    const resp = await fetch(pathUrl);
    pathResponse = await resp.json();
  } catch (error) {
    return {
      success: false,
      error: 'Failed to find swap path. Network error.',
    };
  }

  if (!pathResponse._embedded?.records?.length) {
    return {
      success: false,
      error: `No swap path found from ${sourceAssetCode} to ${destAssetCode}. Try adding a trustline or using a different pair.`,
    };
  }

  const bestPath = pathResponse._embedded.records[0];
  const destAmount = parseFloat(bestPath.destination_amount);
  const minDestAmount = (destAmount * (1 - slippage / 100)).toFixed(7);

  // Build path assets array
  const pathAssets = (bestPath.path || []).map((p: any) => ({
    code: p.asset_code || 'XLM',
    issuer: p.asset_issuer || null,
  }));

  // Execute swap via background script (quantum-safe)
  const swapResponse = await sendMessage('SWAP_TOKENS', {
    sendAsset: sourceAsset,
    destAsset: destAsset,
    sendAmount: amount,
    destMinAmount: minDestAmount,
    pathAssets: pathAssets,
  });

  if (!swapResponse.success) {
    return {
      success: false,
      error: swapResponse.error || 'Swap failed',
    };
  }

  const txHash = swapResponse.data?.txHash;
  return {
    success: true,
    txHash,
    explorerUrl: txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : undefined,
    data: {
      sourceAsset: sourceAssetCode,
      destAsset: destAssetCode,
      sourceAmount: amount,
      destAmount: bestPath.destination_amount,
      minDestAmount,
      message: `Swapped ${amount} ${sourceAssetCode} → ${parseFloat(bestPath.destination_amount).toFixed(4)} ${destAssetCode}`,
    },
  };
}

async function fetchPortfolio(block: AgentBlock): Promise<ExecutionResult> {
  // Get wallet address
  const walletResponse = await sendMessage('GET_WALLET');
  if (!walletResponse.success || !walletResponse.data) {
    return {
      success: false,
      error: 'Wallet not connected',
    };
  }

  const address = walletResponse.data.address;

  // Fetch account from Horizon
  try {
    const response = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: true,
          data: {
            address,
            balances: [{ asset: 'XLM', balance: '0' }],
            message: 'Account not funded yet',
          },
        };
      }
      throw new Error(`Horizon error: ${response.status}`);
    }

    const accountData = await response.json();

    const balances = accountData.balances.map((b: any) => ({
      asset: b.asset_type === 'native' ? 'XLM' : b.asset_code,
      issuer: b.asset_issuer || null,
      balance: b.balance,
    }));

    return {
      success: true,
      data: {
        address,
        balances,
        message: `Found ${balances.length} asset(s)`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch portfolio',
    };
  }
}

async function fetchOrderbook(block: AgentBlock): Promise<ExecutionResult> {
  const baseParam = block.parameters?.find(p => p.name === 'baseAsset');
  const quoteParam = block.parameters?.find(p => p.name === 'quoteAsset');

  const baseAssetCode = (baseParam?.value as string) || 'XLM';
  const quoteAssetCode = (quoteParam?.value as string) || 'USDC';

  const baseAsset = TESTNET_ASSETS[baseAssetCode] || { code: baseAssetCode, issuer: null };
  const quoteAsset = TESTNET_ASSETS[quoteAssetCode] || { code: quoteAssetCode, issuer: null };

  // Build Horizon URL
  let url = `${HORIZON_URL}/order_book?selling_asset_type=${baseAsset.issuer ? 'credit_alphanum4' : 'native'}`;
  if (baseAsset.issuer) {
    url += `&selling_asset_code=${baseAsset.code}&selling_asset_issuer=${baseAsset.issuer}`;
  }
  url += `&buying_asset_type=${quoteAsset.issuer ? 'credit_alphanum4' : 'native'}`;
  if (quoteAsset.issuer) {
    url += `&buying_asset_code=${quoteAsset.code}&buying_asset_issuer=${quoteAsset.issuer}`;
  }
  url += '&limit=10';

  try {
    const response = await fetch(url);
    const orderbook = await response.json();

    return {
      success: true,
      data: {
        pair: `${baseAssetCode}/${quoteAssetCode}`,
        bids: orderbook.bids?.slice(0, 5) || [],
        asks: orderbook.asks?.slice(0, 5) || [],
        spread: orderbook.bids?.[0] && orderbook.asks?.[0]
          ? (parseFloat(orderbook.asks[0].price) - parseFloat(orderbook.bids[0].price)).toFixed(6)
          : 'N/A',
        message: `Fetched orderbook for ${baseAssetCode}/${quoteAssetCode}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch orderbook',
    };
  }
}

async function fetchOHLCV(block: AgentBlock): Promise<ExecutionResult> {
  const baseParam = block.parameters?.find(p => p.name === 'baseAsset');
  const quoteParam = block.parameters?.find(p => p.name === 'quoteAsset');
  const resolutionParam = block.parameters?.find(p => p.name === 'resolution' || p.name === 'timeframe');

  const baseAssetCode = (baseParam?.value as string) || 'XLM';
  const quoteAssetCode = (quoteParam?.value as string) || 'USDC';
  const resolution = (resolutionParam?.value as string) || '3600000'; // Default 1 hour

  const baseAsset = TESTNET_ASSETS[baseAssetCode] || { code: baseAssetCode, issuer: null };
  const quoteAsset = TESTNET_ASSETS[quoteAssetCode] || { code: quoteAssetCode, issuer: null };

  // Calculate time range (last 24 hours)
  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;

  // Build Horizon trade aggregations URL
  let url = `${HORIZON_URL}/trade_aggregations?base_asset_type=${baseAsset.issuer ? 'credit_alphanum4' : 'native'}`;
  if (baseAsset.issuer) {
    url += `&base_asset_code=${baseAsset.code}&base_asset_issuer=${baseAsset.issuer}`;
  }
  url += `&counter_asset_type=${quoteAsset.issuer ? 'credit_alphanum4' : 'native'}`;
  if (quoteAsset.issuer) {
    url += `&counter_asset_code=${quoteAsset.code}&counter_asset_issuer=${quoteAsset.issuer}`;
  }
  url += `&resolution=${resolution}&start_time=${startTime}&end_time=${endTime}&limit=24&order=desc`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const candles = (data._embedded?.records || []).map((r: any) => ({
      timestamp: parseInt(r.timestamp),
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: parseFloat(r.base_volume),
    })).reverse();

    const latestPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

    return {
      success: true,
      data: {
        pair: `${baseAssetCode}/${quoteAssetCode}`,
        resolution,
        candles,
        latestPrice,
        candleCount: candles.length,
        message: `Fetched ${candles.length} candles for ${baseAssetCode}/${quoteAssetCode}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch OHLCV data',
    };
  }
}

export default useBlockExecutor;
