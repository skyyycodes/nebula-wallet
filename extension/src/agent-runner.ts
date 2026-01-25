/**
 * Agent Execution Engine
 * 
 * Background service that monitors price triggers and executes agent flows.
 * Supports both real and mock execution modes:
 * - Real: Uses Horizon SDEX for prices, submits via quantum-safe relayer
 * - Mock: Uses mainnet prices for triggers, simulates transaction execution
 * 
 * Features:
 * - Price triggers with mainnet/testnet price sources
 * - Time-based triggers (intervals, schedules)
 * - Condition evaluation (AND, OR, comparison)
 * - Strategy templates (DCA, Stop-Loss, Grid Trading)
 * - Mock execution for demos
 */

import { buildSwapTransaction, buildPaymentTransaction } from './stellar';
import { getSphincsModule, uint8ArrayToBase64 } from './sphincs';
import { loadWallet, WalletData } from './storage';

// Horizon URL for testnet
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Relayer URL for quantum-safe transaction submission
const RELAYER_URL = 'https://nebula-ext.vercel.app';

// CoinGecko API for mainnet prices
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Known testnet assets
const TESTNET_ASSETS: Record<string, { code: string; issuer: string | null }> = {
  XLM: { code: 'XLM', issuer: null },
  USDC: { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  yUSDC: { code: 'yUSDC', issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF' },
  AQUA: { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA' },
  SRT: { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B' },
};

// CoinGecko asset IDs for mainnet prices
const COINGECKO_IDS: Record<string, string> = {
  XLM: 'stellar',
  USDC: 'usd-coin',
  AQUA: 'aquarius-fi',
};

// ============ Types ============

export interface AgentBlock {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  parameters?: BlockParameter[];
}

export interface BlockParameter {
  id: string;
  name: string;
  type: string;
  value: any;
}

export interface BlockConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ExecutionConfig {
  pollInterval: number;       // Poll interval in milliseconds (default: 30000 = 30s)
  autoExecute: boolean;       // Execute automatically when triggered (vs notify only)
  notifyOnTrigger: boolean;   // Show notification when trigger fires
  dailyLimit: number;         // Max executions per day (0 = unlimited)
  maxSlippage: number;        // Max slippage percentage for swaps
  useMockExecution: boolean;  // Mock execution mode (simulates transactions)
  useMainnetPrices: boolean;  // Use mainnet prices for triggers (via CoinGecko)
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  blocks: AgentBlock[];
  connections: BlockConnection[];
  isActive: boolean;
  status: 'draft' | 'active' | 'paused';
  executionConfig?: ExecutionConfig;
}

export interface ExecutionLog {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  triggerId: string;
  triggerType: string;
  triggerCondition: string;
  action: string;
  result: 'success' | 'error' | 'skipped' | 'mock';
  txHash?: string;
  error?: string;
  priceAtTrigger?: number;
  isMock?: boolean;
  mockDetails?: {
    simulatedAmount: string;
    simulatedAsset: string;
    simulatedDestination?: string;
  };
}

// Strategy template interface
export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'dca' | 'stop-loss' | 'take-profit' | 'grid' | 'custom';
  blocks: AgentBlock[];
  connections: BlockConnection[];
  defaultConfig: Partial<ExecutionConfig>;
}

export interface AgentRunnerState {
  runningAgents: Map<string, {
    agent: Agent;
    intervalId: ReturnType<typeof setInterval>;
    lastCheck: number;
    executionsToday: number;
    lastExecutionDate: string;
  }>;
  executionLogs: ExecutionLog[];
  priceCache: Map<string, { price: number; timestamp: number }>;
}

// ============ Agent Runner State ============

const state: AgentRunnerState = {
  runningAgents: new Map(),
  executionLogs: [],
  priceCache: new Map(),
};

// Storage key for execution logs
const EXECUTION_LOGS_KEY = 'agent_execution_logs';
const MAX_LOGS = 100;

// Global config for mock mode (can be overridden per agent)
let globalConfig: ExecutionConfig | null = null;

// ============ Mainnet Price Source ============

/**
 * Get current mainnet price from CoinGecko
 */
async function getMainnetPrice(asset: string): Promise<number | null> {
  try {
    const coinId = COINGECKO_IDS[asset.toUpperCase()];
    if (!coinId) {
      console.warn(`[AgentRunner] No CoinGecko ID for asset: ${asset}`);
      return null;
    }

    const url = `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[AgentRunner] CoinGecko API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const price = data[coinId]?.usd;
    
    if (price !== undefined) {
      console.log(`[AgentRunner] Mainnet price for ${asset}: $${price}`);
      return price;
    }

    return null;
  } catch (error) {
    console.error('[AgentRunner] Error fetching mainnet price:', error);
    return null;
  }
}

// ============ Price Monitor ============

/**
 * Get current price for an asset pair from Horizon SDEX orderbook
 */
async function getAssetPrice(baseAsset: string, quoteAsset: string = 'USDC'): Promise<number | null> {
  try {
    const base = TESTNET_ASSETS[baseAsset.toUpperCase()];
    const quote = TESTNET_ASSETS[quoteAsset.toUpperCase()];

    if (!base || !quote) {
      console.warn(`[AgentRunner] Unknown asset: ${baseAsset} or ${quoteAsset}`);
      return null;
    }

    // Format asset for Horizon API
    const formatAsset = (asset: { code: string; issuer: string | null }) => {
      if (asset.issuer === null) {
        return 'native';
      }
      return `${asset.code}:${asset.issuer}`;
    };

    // Get orderbook from Horizon
    const sellingAsset = formatAsset(base);
    const buyingAsset = formatAsset(quote);

    let url: string;
    if (sellingAsset === 'native') {
      url = `${HORIZON_URL}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${quote.code}&buying_asset_issuer=${quote.issuer}`;
    } else if (buyingAsset === 'native') {
      url = `${HORIZON_URL}/order_book?selling_asset_type=credit_alphanum4&selling_asset_code=${base.code}&selling_asset_issuer=${base.issuer}&buying_asset_type=native`;
    } else {
      url = `${HORIZON_URL}/order_book?selling_asset_type=credit_alphanum4&selling_asset_code=${base.code}&selling_asset_issuer=${base.issuer}&buying_asset_type=credit_alphanum4&buying_asset_code=${quote.code}&buying_asset_issuer=${quote.issuer}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[AgentRunner] Failed to fetch orderbook: ${response.status}`);
      return null;
    }

    const orderbook = await response.json();

    // Get best bid (highest buy price) - this is what you'd get if selling
    if (orderbook.bids && orderbook.bids.length > 0) {
      const bestBid = orderbook.bids[0];
      const price = parseFloat(bestBid.price);
      
      // Cache the price
      const cacheKey = `${baseAsset}-${quoteAsset}`;
      state.priceCache.set(cacheKey, { price, timestamp: Date.now() });
      
      return price;
    }

    // If no bids, try asks (what you'd pay if buying)
    if (orderbook.asks && orderbook.asks.length > 0) {
      const bestAsk = orderbook.asks[0];
      const price = parseFloat(bestAsk.price);
      
      const cacheKey = `${baseAsset}-${quoteAsset}`;
      state.priceCache.set(cacheKey, { price, timestamp: Date.now() });
      
      return price;
    }

    return null;
  } catch (error) {
    console.error('[AgentRunner] Error fetching price:', error);
    return null;
  }
}

/**
 * Get cached price or fetch new one
 */
async function getCachedPrice(baseAsset: string, quoteAsset: string = 'USDC', maxAge: number = 10000): Promise<number | null> {
  const cacheKey = `${baseAsset}-${quoteAsset}`;
  const cached = state.priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < maxAge) {
    return cached.price;
  }
  
  return getAssetPrice(baseAsset, quoteAsset);
}

/**
 * Get price based on config (mainnet or testnet)
 */
async function getPriceForTrigger(asset: string, config: ExecutionConfig): Promise<number | null> {
  if (config.useMainnetPrices) {
    const mainnetPrice = await getMainnetPrice(asset);
    if (mainnetPrice !== null) {
      return mainnetPrice;
    }
    console.warn(`[AgentRunner] Falling back to testnet price for ${asset}`);
  }
  
  return getCachedPrice(asset, 'USDC');
}

// ============ Condition Evaluation ============

interface ConditionResult {
  passed: boolean;
  reason?: string;
}

/**
 * Evaluate a comparison condition block
 */
async function evaluateCompareCondition(block: AgentBlock, context: Record<string, any>): Promise<ConditionResult> {
  const getParam = createParamGetter(block);
  
  const leftValue = getParam(['leftValue', 'value1', 'left']) || getParam(['variable']);
  const rightValue = getParam(['rightValue', 'value2', 'right', 'threshold']);
  const operator = getParam(['operator', 'comparison', 'condition']) || '>';
  
  // Resolve variable references
  let left = context[leftValue] ?? (parseFloat(leftValue) || 0);
  let right = context[rightValue] ?? (parseFloat(rightValue) || 0);
  
  let passed = false;
  switch (operator) {
    case '>':
    case 'greater_than':
      passed = left > right;
      break;
    case '<':
    case 'less_than':
      passed = left < right;
      break;
    case '>=':
    case 'greater_equal':
      passed = left >= right;
      break;
    case '<=':
    case 'less_equal':
      passed = left <= right;
      break;
    case '==':
    case '=':
    case 'equals':
      passed = left === right;
      break;
    case '!=':
    case 'not_equals':
      passed = left !== right;
      break;
  }
  
  return {
    passed,
    reason: `${left} ${operator} ${right} = ${passed}`,
  };
}

/**
 * Evaluate AND/OR condition blocks
 */
function evaluateLogicalCondition(
  type: 'and' | 'or',
  inputResults: ConditionResult[]
): ConditionResult {
  if (inputResults.length === 0) {
    return { passed: true, reason: 'No inputs' };
  }
  
  if (type === 'and') {
    const passed = inputResults.every(r => r.passed);
    return {
      passed,
      reason: `AND: ${inputResults.map(r => r.passed).join(' && ')} = ${passed}`,
    };
  } else {
    const passed = inputResults.some(r => r.passed);
    return {
      passed,
      reason: `OR: ${inputResults.map(r => r.passed).join(' || ')} = ${passed}`,
    };
  }
}

/**
 * Evaluate any condition block
 */
async function evaluateCondition(
  block: AgentBlock,
  context: Record<string, any>,
  inputResults: ConditionResult[] = []
): Promise<ConditionResult> {
  const blockType = block.type;
  const subType = block.data?.subType || '';
  let conditionType = blockType === 'condition' && subType ? subType : blockType;
  
  switch (conditionType) {
    case 'condition_compare':
    case 'compare':
      return evaluateCompareCondition(block, context);
    case 'condition_and':
    case 'and':
      return evaluateLogicalCondition('and', inputResults);
    case 'condition_or':
    case 'or':
      return evaluateLogicalCondition('or', inputResults);
    default:
      return { passed: true, reason: `Unknown condition type: ${conditionType}` };
  }
}

// ============ Parameter Extraction Helper ============

/**
 * Create a parameter getter function for a block
 * Handles multiple storage formats (block palette vs AI chat)
 */
function createParamGetter(block: AgentBlock): (names: string[]) => any {
  return (names: string[]): any => {
    // 1. Check top-level parameters array (block palette format)
    if (block.parameters) {
      for (const name of names) {
        const param = block.parameters.find(p => p.name === name);
        if (param?.value !== undefined) return param.value;
      }
    }
    
    // 2. Check data.parameters array (AI chat format)
    const dataParams = block.data?.parameters;
    if (Array.isArray(dataParams)) {
      for (const name of names) {
        const param = dataParams.find((p: any) => p.name === name);
        if (param?.value !== undefined) return param.value;
      }
    }
    
    // 3. Check data object directly (some implementations)
    for (const name of names) {
      if (block.data?.[name] !== undefined) return block.data[name];
    }
    
    // 4. Check data.config (another format)
    if (block.data?.config) {
      for (const name of names) {
        if (block.data.config[name] !== undefined) return block.data.config[name];
      }
    }
    
    return undefined;
  };
}

// ============ Trigger Evaluation ============

interface TriggerResult {
  triggered: boolean;
  currentValue?: number;
  targetValue?: number;
  condition?: string;
}

/**
 * Evaluate a price trigger block
 */
async function evaluatePriceTrigger(block: AgentBlock, config?: ExecutionConfig): Promise<TriggerResult> {
  // Use unified parameter getter
  const getParam = createParamGetter(block);

  const asset = getParam(['asset', 'token', 'symbol']) || 'XLM';
  const condition = getParam(['condition', 'operator', 'comparison']) || 'below';
  const targetPrice = parseFloat(getParam(['price', 'targetPrice', 'target', 'threshold']) || '0');

  console.log(`[AgentRunner] Price trigger: asset=${asset}, condition=${condition}, targetPrice=${targetPrice}`);
  console.log(`[AgentRunner] Block data:`, JSON.stringify(block.data, null, 2));

  if (targetPrice === 0) {
    console.warn(`[AgentRunner] Target price is 0, skipping trigger`);
    return { triggered: false };
  }

  // Get price based on config (mainnet or testnet)
  const effectiveConfig = config || globalConfig || getDefaultConfig();
  const currentPrice = await getPriceForTrigger(asset, effectiveConfig);
  
  if (currentPrice === null) {
    console.warn(`[AgentRunner] Could not get price for ${asset}`);
    return { triggered: false };
  }

  console.log(`[AgentRunner] Current price: ${currentPrice}, Target: ${targetPrice}, Condition: ${condition}`);
  console.log(`[AgentRunner] Using ${effectiveConfig.useMainnetPrices ? 'mainnet' : 'testnet'} prices`);

  let triggered = false;
  switch (condition) {
    case 'above':
    case 'greater_than':
    case '>':
      triggered = currentPrice > targetPrice;
      break;
    case 'below':
    case 'less_than':
    case '<':
      triggered = currentPrice < targetPrice;
      break;
    case 'equals':
    case 'equal':
    case '=':
    case '==':
      triggered = Math.abs(currentPrice - targetPrice) < 0.0001;
      break;
  }

  console.log(`[AgentRunner] Trigger result: ${triggered}`);

  return {
    triggered,
    currentValue: currentPrice,
    targetValue: targetPrice,
    condition,
  };
}

/**
 * Evaluate a time trigger block
 */
function evaluateTimeTrigger(block: AgentBlock, lastCheck: number): TriggerResult {
  const intervalParam = block.parameters?.find(p => p.name === 'interval');
  const interval = (intervalParam?.value as string) || '1h';

  const intervalMs: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };

  const requiredInterval = intervalMs[interval] || intervalMs['1h'];
  const elapsed = Date.now() - lastCheck;

  return {
    triggered: elapsed >= requiredInterval,
    currentValue: elapsed,
    targetValue: requiredInterval,
    condition: `every ${interval}`,
  };
}

/**
 * Evaluate any trigger block
 */
async function evaluateTrigger(block: AgentBlock, lastCheck: number, config?: ExecutionConfig): Promise<TriggerResult> {
  console.log(`[AgentRunner] Evaluating trigger type: ${block.type}`);
  
  // Handle both naming conventions
  const blockType = block.type;
  const subType = block.data?.subType || block.data?.triggerType || '';
  
  // Determine the actual trigger type
  let triggerType = blockType;
  if (blockType === 'trigger' && subType) {
    triggerType = subType;
  }
  
  console.log(`[AgentRunner] Resolved trigger type: ${triggerType}`);
  
  switch (triggerType) {
    case 'trigger_price':
    case 'price_trigger':
    case 'price':
      return evaluatePriceTrigger(block, config);
    case 'trigger_time':
    case 'time_trigger':
    case 'time':
      return evaluateTimeTrigger(block, lastCheck);
    case 'trigger_indicator':
    case 'indicator_trigger':
    case 'indicator':
      // TODO: Implement indicator triggers (RSI, MACD, etc.)
      return { triggered: false };
    default:
      // If it's a generic trigger type, try to evaluate based on parameters
      if (block.parameters?.some(p => p.name === 'price' || p.name === 'targetPrice')) {
        console.log(`[AgentRunner] Detected price parameters, treating as price trigger`);
        return evaluatePriceTrigger(block);
      }
      console.warn(`[AgentRunner] Unknown trigger type: ${triggerType}`);
      return { triggered: false };
  }
}

// ============ Flow Execution ============

/**
 * Find all blocks connected to a source block
 */
function getConnectedBlocks(connections: BlockConnection[], blocks: AgentBlock[], sourceId: string): AgentBlock[] {
  const connectedBlockIds = connections
    .filter(c => c.source === sourceId)
    .map(c => c.target);
  
  return blocks.filter(b => connectedBlockIds.includes(b.id));
}

/**
 * Execute an action block
 */
async function executeActionBlock(
  block: AgentBlock, 
  wallet: WalletData,
  config: ExecutionConfig
): Promise<{ success: boolean; txHash?: string; error?: string; isMock?: boolean; mockDetails?: ExecutionLog['mockDetails'] }> {
  console.log(`[AgentRunner] Executing action block: ${block.type}`, block);
  
  try {
    // Determine action type - handle both naming conventions
    const blockType = block.type;
    const subType = block.data?.subType || block.data?.actionType || '';
    let actionType = blockType;
    
    if (blockType === 'action' && subType) {
      actionType = subType;
    }
    
    console.log(`[AgentRunner] Resolved action type: ${actionType}`);
    console.log(`[AgentRunner] Mock execution mode: ${config.useMockExecution}`);
    
    switch (actionType) {
      case 'action_swap':
      case 'swap':
      case 'action_buy':
      case 'buy':
      case 'action_sell':
      case 'sell': {
        return executeSwapAction(block, wallet, config);
      }

      case 'action_transfer':
      case 'transfer':
      case 'send': {
        return executeTransferAction(block, wallet, config);
      }

      case 'action_multi_send':
      case 'multi_send':
      case 'batch_send': {
        return executeMultiSendAction(block, wallet, config);
      }

      case 'action_notify':
      case 'webhook':
      case 'notify': {
        return executeWebhookAction(block, config);
      }

      default:
        // Try to detect from parameters
        const getParam = createParamGetter(block);
        if (getParam(['fromAsset', 'toAsset', 'amount'])) {
          console.log(`[AgentRunner] Detected swap parameters, treating as swap action`);
          return executeSwapAction(block, wallet, config);
        }
        if (getParam(['recipients', 'addresses'])) {
          console.log(`[AgentRunner] Detected multi-send parameters`);
          return executeMultiSendAction(block, wallet, config);
        }
        if (getParam(['url', 'webhookUrl', 'endpoint'])) {
          console.log(`[AgentRunner] Detected webhook parameters`);
          return executeWebhookAction(block, config);
        }
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a swap action via relayer (or mock)
 */
async function executeSwapAction(
  block: AgentBlock, 
  wallet: WalletData,
  config: ExecutionConfig
): Promise<{ success: boolean; txHash?: string; error?: string; isMock?: boolean; mockDetails?: ExecutionLog['mockDetails'] }> {
  const getParam = createParamGetter(block);
  
  let fromAssetCode = getParam(['fromAsset', 'asset', 'sellAsset']) || 'XLM';
  let toAssetCode = getParam(['toAsset', 'buyAsset']) || 'USDC';
  const amount = getParam(['amount', 'quantity']) || '10';

  // For buy/sell actions, adjust direction based on action type
  const blockType = block.type;
  const subType = block.data?.subType || '';
  const actionType = blockType === 'action' ? subType : blockType;
  
  if (actionType === 'action_buy' || actionType === 'buy') {
    // Buy means: use USDC to buy the asset
    toAssetCode = fromAssetCode;
    fromAssetCode = 'USDC';
  } else if (actionType === 'action_sell' || actionType === 'sell') {
    // Sell means: sell the asset for USDC
    toAssetCode = 'USDC';
  }

  const fromAsset = TESTNET_ASSETS[fromAssetCode.toUpperCase()];
  const toAsset = TESTNET_ASSETS[toAssetCode.toUpperCase()];

  if (!fromAsset || !toAsset) {
    return { success: false, error: `Unknown asset: ${fromAssetCode} or ${toAssetCode}` };
  }

  // Mock execution mode
  if (config.useMockExecution) {
    console.log(`[AgentRunner] MOCK: Simulating swap ${amount} ${fromAssetCode} -> ${toAssetCode}`);
    
    // Generate mock transaction hash
    const mockTxHash = `MOCK_${Date.now()}_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      txHash: mockTxHash,
      isMock: true,
      mockDetails: {
        simulatedAmount: amount,
        simulatedAsset: `${fromAssetCode} -> ${toAssetCode}`,
      },
    };
  }

  // Real execution
  // Get path from Horizon
  const pathResult = await findSwapPath(fromAsset, toAsset, amount);
  if (!pathResult.success || !pathResult.destAmount) {
    return { success: false, error: pathResult.error || 'Could not find swap path' };
  }

  // Apply slippage
  const slippage = config.maxSlippage / 100;
  const minDestAmount = (parseFloat(pathResult.destAmount) * (1 - slippage)).toFixed(7);

  // Build swap transaction
  const txResult = await buildSwapTransaction(
    wallet.stellarPublicKey,
    fromAsset,
    toAsset,
    amount,
    minDestAmount,
    pathResult.path || []
  );

  // Sign with SPHINCS+ and submit via relayer
  return submitQuantumTransaction(txResult.xdr, wallet);
}

/**
 * Execute a transfer action via relayer (or mock)
 */
async function executeTransferAction(
  block: AgentBlock, 
  wallet: WalletData,
  config: ExecutionConfig
): Promise<{ success: boolean; txHash?: string; error?: string; isMock?: boolean; mockDetails?: ExecutionLog['mockDetails'] }> {
  const getParam = createParamGetter(block);
  
  const destination = getParam(['destinationAddress', 'destination', 'recipient', 'to']);
  const amount = getParam(['amount', 'quantity']) || '1';
  const asset = getParam(['asset', 'token']) || 'XLM';

  if (!destination) {
    return { success: false, error: 'Destination address required' };
  }

  // Mock execution mode
  if (config.useMockExecution) {
    console.log(`[AgentRunner] MOCK: Simulating transfer ${amount} ${asset} to ${destination.substring(0, 10)}...`);
    
    // Generate mock transaction hash
    const mockTxHash = `MOCK_${Date.now()}_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      txHash: mockTxHash,
      isMock: true,
      mockDetails: {
        simulatedAmount: amount,
        simulatedAsset: asset,
        simulatedDestination: destination,
      },
    };
  }

  // Real execution
  // Build payment transaction
  const txResult = await buildPaymentTransaction(
    wallet.stellarPublicKey,
    destination,
    amount
  );

  // Sign with SPHINCS+ and submit via relayer
  return submitQuantumTransaction(txResult.xdr, wallet);
}

/**
 * Execute a multi-send action (batch payments to multiple recipients)
 */
async function executeMultiSendAction(
  block: AgentBlock, 
  wallet: WalletData,
  config: ExecutionConfig
): Promise<{ success: boolean; txHash?: string; error?: string; isMock?: boolean; mockDetails?: ExecutionLog['mockDetails'] }> {
  const getParam = createParamGetter(block);
  
  // Parse recipients - can be array or comma-separated string
  let recipientsRaw = getParam(['recipients', 'addresses', 'destinations']);
  let recipients: Array<{ address: string; amount: string }> = [];

  if (typeof recipientsRaw === 'string') {
    // Parse comma-separated format: "addr1:amount1,addr2:amount2" or just addresses
    const parts = recipientsRaw.split(',').map(s => s.trim());
    const defaultAmount = getParam(['amount', 'defaultAmount']) || '1';
    
    recipients = parts.map(part => {
      if (part.includes(':')) {
        const [address, amount] = part.split(':');
        return { address: address.trim(), amount: amount.trim() };
      }
      return { address: part, amount: defaultAmount };
    });
  } else if (Array.isArray(recipientsRaw)) {
    recipients = recipientsRaw.map((r: any) => ({
      address: r.address || r.destination || r,
      amount: r.amount || getParam(['amount', 'defaultAmount']) || '1',
    }));
  }

  if (recipients.length === 0) {
    return { success: false, error: 'No recipients specified for multi-send' };
  }

  // Validate addresses (Stellar addresses are 56 characters starting with G)
  for (let i = 0; i < recipients.length; i++) {
    const addr = recipients[i].address;
    if (!addr || addr.length !== 56 || !addr.startsWith('G')) {
      return { 
        success: false, 
        error: `Invalid Stellar address at position ${i + 1}: "${addr}" (must be 56 chars starting with G)`
      };
    }
    if (!recipients[i].amount || parseFloat(recipients[i].amount) <= 0) {
      return {
        success: false,
        error: `Invalid amount at position ${i + 1}: "${recipients[i].amount}" (must be > 0)`
      };
    }
  }

  const memo = getParam(['memo', 'note']) || '';

  // Mock execution mode
  if (config.useMockExecution) {
    console.log(`[AgentRunner] MOCK: Simulating multi-send to ${recipients.length} recipients`);
    
    const mockTxHash = `MOCK_MULTI_${Date.now()}_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      txHash: mockTxHash,
      isMock: true,
      mockDetails: {
        simulatedAmount: recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0).toString(),
        simulatedAsset: 'XLM',
        simulatedDestination: `${recipients.length} recipients`,
      },
    };
  }

  // Real execution - import dynamically to avoid circular deps
  try {
    console.log(`[AgentRunner] Building multi-send transaction for ${recipients.length} recipients`);
    console.log(`[AgentRunner] Recipients:`, JSON.stringify(recipients));
    
    const { buildMultiSendTransaction } = await import('./stellar');
    
    const txResult = await buildMultiSendTransaction(
      wallet.stellarPublicKey,
      recipients,
      memo
    );

    console.log(`[AgentRunner] Multi-send transaction built, submitting...`);
    return submitQuantumTransaction(txResult.xdr, wallet);
  } catch (error) {
    console.error(`[AgentRunner] Multi-send error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Multi-send transaction failed',
    };
  }
}

/**
 * Execute a webhook/notification action
 */
async function executeWebhookAction(
  block: AgentBlock,
  config: ExecutionConfig
): Promise<{ success: boolean; txHash?: string; error?: string; isMock?: boolean; mockDetails?: ExecutionLog['mockDetails'] }> {
  const getParam = createParamGetter(block);
  
  const url = getParam(['url', 'webhookUrl', 'endpoint']);
  const method = getParam(['method']) || 'POST';
  const payloadTemplate = getParam(['payload', 'body', 'data']) || {};

  if (!url) {
    return { success: false, error: 'Webhook URL is required' };
  }

  // Build payload with context
  const payload = {
    ...payloadTemplate,
    timestamp: new Date().toISOString(),
    source: 'nebula-agent',
    blockId: block.id,
    blockType: block.type,
  };

  // Mock execution mode
  if (config.useMockExecution) {
    console.log(`[AgentRunner] MOCK: Simulating webhook POST to ${url}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      success: true,
      isMock: true,
      mockDetails: {
        simulatedAmount: '1',
        simulatedAsset: 'webhook',
        simulatedDestination: url,
      },
    };
  }

  // Real execution
  try {
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: `Webhook failed with status ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Webhook request failed',
    };
  }
}

/**
 * Send webhook notifications for an event (exported for use by trigger system)
 */
export async function sendWebhookNotifications(
  eventType: string,
  eventData: Record<string, any>
): Promise<void> {
  try {
    const { getWebhooksForEvent } = await import('./storage');
    const webhooks = await getWebhooksForEvent(eventType);

    for (const webhook of webhooks) {
      if (!webhook.enabled) continue;

      const payload = {
        event: eventType,
        data: eventData,
        timestamp: new Date().toISOString(),
        webhookId: webhook.id,
      };

      try {
        await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...webhook.headers,
          },
          body: JSON.stringify(payload),
        });
        console.log(`[AgentRunner] Webhook sent to ${webhook.url} for event ${eventType}`);
      } catch (err) {
        console.error(`[AgentRunner] Failed to send webhook to ${webhook.url}:`, err);
      }
    }
  } catch (error) {
    console.error('[AgentRunner] Error sending webhook notifications:', error);
  }
}

/**
 * Find swap path using Horizon
 */
async function findSwapPath(
  fromAsset: { code: string; issuer: string | null },
  toAsset: { code: string; issuer: string | null },
  amount: string
): Promise<{ success: boolean; destAmount?: string; path?: Array<{ code: string; issuer: string | null }>; error?: string }> {
  try {
    let sourceAssetType = fromAsset.issuer === null ? 'native' : 'credit_alphanum4';
    let destAssetType = toAsset.issuer === null ? 'native' : 'credit_alphanum4';

    let url = `${HORIZON_URL}/paths/strict-send?source_asset_type=${sourceAssetType}`;
    if (fromAsset.issuer) {
      url += `&source_asset_code=${fromAsset.code}&source_asset_issuer=${fromAsset.issuer}`;
    }
    url += `&source_amount=${amount}`;

    // Add destination asset
    if (toAsset.issuer === null) {
      url += `&destination_assets=native`;
    } else {
      url += `&destination_assets=${toAsset.code}:${toAsset.issuer}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Path finding failed: ${errorText}` };
    }

    const data = await response.json();
    const records = data._embedded?.records || [];

    if (records.length === 0) {
      return { success: false, error: 'No swap path found' };
    }

    // Use best path (highest destination amount)
    const bestPath = records[0];
    const path = (bestPath.path || []).map((asset: any) => ({
      code: asset.asset_type === 'native' ? 'XLM' : asset.asset_code,
      issuer: asset.asset_type === 'native' ? null : asset.asset_issuer,
    }));

    return {
      success: true,
      destAmount: bestPath.destination_amount,
      path,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Path finding error',
    };
  }
}

/**
 * Sign with SPHINCS+ and submit via relayer
 */
async function submitQuantumTransaction(
  xdr: string,
  wallet: WalletData
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get SPHINCS+ module and sign
    const sphincs = await getSphincsModule();
    const secretKey = Uint8Array.from(atob(wallet.sphincsSecretKey), c => c.charCodeAt(0));
    const message = new TextEncoder().encode(xdr);
    const signature = await sphincs.sign(message, secretKey);

    // Submit to relayer
    const response = await fetch(`${RELAYER_URL}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xdr,
        sphincsSignature: uint8ArrayToBase64(signature),
        sphincsPublicKey: wallet.sphincsPublicKey,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || 'Relayer submission failed' };
    }

    return {
      success: true,
      txHash: result.hash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction submission error',
    };
  }
}

// ============ Agent Runner Core ============

/**
 * Check agent triggers and execute if triggered
 */
async function checkAgent(agentId: string): Promise<void> {
  console.log(`[AgentRunner] Checking agent: ${agentId}`);
  
  const running = state.runningAgents.get(agentId);
  if (!running) {
    console.warn(`[AgentRunner] Agent ${agentId} not found in running agents`);
    return;
  }

  const { agent, lastCheck, executionsToday, lastExecutionDate } = running;
  console.log(`[AgentRunner] Agent ${agent.name} has ${agent.blocks.length} blocks, ${agent.connections.length} connections`);
  
  // Reset daily counter if new day
  const today = new Date().toISOString().split('T')[0];
  let todayExecutions = executionsToday;
  if (lastExecutionDate !== today) {
    todayExecutions = 0;
  }

  // Check daily limit
  const config = agent.executionConfig || getDefaultConfig();
  console.log(`[AgentRunner] Config: autoExecute=${config.autoExecute}, pollInterval=${config.pollInterval}`);
  
  if (config.dailyLimit > 0 && todayExecutions >= config.dailyLimit) {
    console.log(`[AgentRunner] Agent ${agent.name} reached daily limit (${config.dailyLimit})`);
    return;
  }

  // Find all trigger blocks - handle both naming conventions:
  // - 'trigger_price', 'trigger_time' (from block palette)
  // - 'trigger' with subType (from AI chat)
  const triggerBlocks = agent.blocks.filter(b => 
    b.type.startsWith('trigger_') || 
    b.type === 'trigger' ||
    b.type.includes('trigger')
  );
  console.log(`[AgentRunner] Found ${triggerBlocks.length} trigger blocks:`, triggerBlocks.map(t => ({ type: t.type, data: t.data, params: t.parameters })));

  for (const trigger of triggerBlocks) {
    console.log(`[AgentRunner] Evaluating trigger: ${trigger.type}, params:`, trigger.parameters);
    const result = await evaluateTrigger(trigger, lastCheck, config);
    console.log(`[AgentRunner] Trigger result:`, result);

    if (result.triggered) {
      console.log(`[AgentRunner] Trigger fired for agent ${agent.name}: ${trigger.type}`);

      // Create execution log entry
      const logEntry: ExecutionLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
        triggerId: trigger.id,
        triggerType: trigger.type,
        triggerCondition: `${result.condition}: ${result.currentValue?.toFixed(4)} vs ${result.targetValue}`,
        action: '',
        result: 'success',
        priceAtTrigger: result.currentValue,
        isMock: config.useMockExecution,
      };

      // Notify user if enabled
      if (config.notifyOnTrigger) {
        const modeLabel = config.useMockExecution ? ' [MOCK]' : '';
        showNotification(agent.name, `Trigger fired${modeLabel}: ${trigger.label}`, result);
      }

      // Execute connected actions if autoExecute is enabled
      if (config.autoExecute) {
        const wallet = await loadWallet();
        if (!wallet && !config.useMockExecution) {
          logEntry.result = 'error';
          logEntry.error = 'No wallet found';
          addExecutionLog(logEntry);
          continue;
        }

        // Get action blocks connected to this trigger - handle both naming conventions
        const actionBlocks = getConnectedBlocks(agent.connections, agent.blocks, trigger.id)
          .filter(b => 
            b.type.startsWith('action_') || 
            b.type === 'action' ||
            b.type.includes('action')
          );
        console.log(`[AgentRunner] Found ${actionBlocks.length} connected action blocks`);

        // If no direct connections, try to find any action blocks
        let actionsToExecute = actionBlocks;
        if (actionsToExecute.length === 0) {
          console.log(`[AgentRunner] No direct connections, looking for any action blocks`);
          actionsToExecute = agent.blocks.filter(b => 
            b.type.startsWith('action_') || 
            b.type === 'action' ||
            b.type.includes('action')
          );
          console.log(`[AgentRunner] Found ${actionsToExecute.length} action blocks in agent`);
        }

        for (const action of actionsToExecute) {
          logEntry.action = action.label || action.type;

          // Use mock wallet if in mock mode and no real wallet
          const execWallet = wallet || (config.useMockExecution ? createMockWallet() : null);
          if (!execWallet) {
            logEntry.result = 'error';
            logEntry.error = 'No wallet found';
            addExecutionLog(logEntry);
            continue;
          }

          const execResult = await executeActionBlock(action, execWallet, config);
          
          if (execResult.success) {
            logEntry.result = execResult.isMock ? 'mock' : 'success';
            logEntry.txHash = execResult.txHash;
            logEntry.isMock = execResult.isMock;
            logEntry.mockDetails = execResult.mockDetails;
            todayExecutions++;
          } else {
            logEntry.result = 'error';
            logEntry.error = execResult.error;
          }

          addExecutionLog({ ...logEntry, id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });
        }

        // Update execution count
        running.executionsToday = todayExecutions;
        running.lastExecutionDate = today;
      } else {
        logEntry.action = 'notification_only';
        logEntry.result = 'skipped';
        addExecutionLog(logEntry);
      }

      // Update last check time
      running.lastCheck = Date.now();
    }
  }
}

/**
 * Create a mock wallet for mock execution mode
 */
function createMockWallet(): WalletData {
  return {
    id: 'mock-wallet',
    name: 'Mock Wallet',
    stellarPublicKey: 'MOCK_STELLAR_PUBLIC_KEY_FOR_DEMO_PURPOSES',
    stellarSecretKey: 'MOCK_STELLAR_SECRET_KEY',
    sphincsPublicKey: 'MOCK_SPHINCS_PUBLIC_KEY',
    sphincsSecretKey: 'MOCK_SPHINCS_SECRET_KEY',
    mnemonic: 'mock mnemonic for demo purposes only',
    isLocked: false,
    createdAt: new Date().toISOString(),
  } as unknown as WalletData;
}

/**
 * Show browser notification
 */
function showNotification(agentName: string, message: string, data?: TriggerResult): void {
  const body = data 
    ? `${message}\nCurrent: ${data.currentValue?.toFixed(4)} | Target: ${data.targetValue?.toFixed(4)}`
    : message;

  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: `Nebula Agent: ${agentName}`,
    message: body,
    priority: 2,
  });
}

/**
 * Add execution log and persist
 */
function addExecutionLog(log: ExecutionLog): void {
  state.executionLogs.unshift(log);
  
  // Trim to max logs
  if (state.executionLogs.length > MAX_LOGS) {
    state.executionLogs = state.executionLogs.slice(0, MAX_LOGS);
  }

  // Persist to storage
  chrome.storage.local.set({ [EXECUTION_LOGS_KEY]: state.executionLogs });
}

/**
 * Load execution logs from storage
 */
async function loadExecutionLogs(): Promise<ExecutionLog[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([EXECUTION_LOGS_KEY], (result) => {
      const logs = result[EXECUTION_LOGS_KEY] || [];
      state.executionLogs = logs;
      resolve(logs);
    });
  });
}

/**
 * Get default execution config
 */
export function getDefaultConfig(): ExecutionConfig {
  return {
    pollInterval: 30000,      // 30 seconds
    autoExecute: true,        // Execute automatically when triggered
    notifyOnTrigger: true,
    dailyLimit: 10,           // Max 10 executions per day
    maxSlippage: 3,           // 3% slippage
    useMockExecution: false,  // Real execution by default
    useMainnetPrices: true,   // Use mainnet prices for triggers
  };
}

/**
 * Set global config (applies to new agents)
 */
export function setGlobalConfig(config: Partial<ExecutionConfig>): void {
  globalConfig = { ...getDefaultConfig(), ...config };
  console.log(`[AgentRunner] Global config updated:`, globalConfig);
}

// ============ Public API ============

/**
 * Start running an agent
 */
export function startAgent(agent: Agent): { success: boolean; error?: string } {
  console.log(`[AgentRunner] Starting agent: ${agent.id} - ${agent.name}`);
  console.log(`[AgentRunner] Agent blocks:`, agent.blocks.map(b => ({ id: b.id, type: b.type, params: b.parameters })));
  console.log(`[AgentRunner] Agent connections:`, agent.connections);
  
  if (state.runningAgents.has(agent.id)) {
    console.log(`[AgentRunner] Agent ${agent.id} already running`);
    return { success: false, error: 'Agent is already running' };
  }

  // Validate agent has triggers - handle both naming conventions
  const hasTriggers = agent.blocks.some(b => 
    b.type.startsWith('trigger_') || 
    b.type === 'trigger' ||
    b.type.includes('trigger')
  );
  console.log(`[AgentRunner] Has triggers: ${hasTriggers}`);
  
  if (!hasTriggers) {
    return { success: false, error: 'Agent must have at least one trigger block' };
  }

  const config = agent.executionConfig || getDefaultConfig();
  console.log(`[AgentRunner] Using config:`, config);

  // Set up polling interval
  const intervalId = setInterval(() => {
    console.log(`[AgentRunner] Polling tick for agent: ${agent.id}`);
    checkAgent(agent.id);
  }, config.pollInterval);

  // Store running state
  state.runningAgents.set(agent.id, {
    agent,
    intervalId,
    lastCheck: Date.now(),
    executionsToday: 0,
    lastExecutionDate: new Date().toISOString().split('T')[0],
  });

  console.log(`[AgentRunner] Started agent: ${agent.name} (poll: ${config.pollInterval}ms)`);
  console.log(`[AgentRunner] Running agents count: ${state.runningAgents.size}`);

  // Run initial check
  checkAgent(agent.id);

  return { success: true };
}

/**
 * Stop a running agent
 */
export function stopAgent(agentId: string): { success: boolean; error?: string } {
  const running = state.runningAgents.get(agentId);
  if (!running) {
    return { success: false, error: 'Agent is not running' };
  }

  clearInterval(running.intervalId);
  state.runningAgents.delete(agentId);

  console.log(`[AgentRunner] Stopped agent: ${running.agent.name}`);

  return { success: true };
}

/**
 * Get status of an agent
 */
export function getAgentRunnerStatus(agentId: string): {
  isRunning: boolean;
  lastCheck?: number;
  executionsToday?: number;
  pollInterval?: number;
} {
  const running = state.runningAgents.get(agentId);
  if (!running) {
    return { isRunning: false };
  }

  const config = running.agent.executionConfig || getDefaultConfig();

  return {
    isRunning: true,
    lastCheck: running.lastCheck,
    executionsToday: running.executionsToday,
    pollInterval: config.pollInterval,
  };
}

/**
 * Get all execution logs
 */
export function getExecutionLogs(agentId?: string): ExecutionLog[] {
  if (agentId) {
    return state.executionLogs.filter(l => l.agentId === agentId);
  }
  return state.executionLogs;
}

/**
 * Get list of all running agents
 */
export function getRunningAgents(): string[] {
  return Array.from(state.runningAgents.keys());
}

/**
 * Update agent config while running
 */
export function updateAgentRunnerConfig(agentId: string, config: Partial<ExecutionConfig>): { success: boolean; error?: string } {
  const running = state.runningAgents.get(agentId);
  if (!running) {
    return { success: false, error: 'Agent is not running' };
  }

  // Update config
  running.agent.executionConfig = {
    ...getDefaultConfig(),
    ...running.agent.executionConfig,
    ...config,
  };

  // If poll interval changed, restart the interval
  if (config.pollInterval) {
    clearInterval(running.intervalId);
    running.intervalId = setInterval(() => {
      checkAgent(agentId);
    }, config.pollInterval);
  }

  return { success: true };
}

/**
 * Initialize agent runner (call on extension startup)
 */
export async function initializeAgentRunner(): Promise<void> {
  // Load execution logs from storage
  await loadExecutionLogs();
  console.log('[AgentRunner] Initialized with', state.executionLogs.length, 'logs');
}

/**
 * Get current price from cache (for UI display)
 */
export async function getCurrentPrice(asset: string, quote: string = 'USDC'): Promise<number | null> {
  return getCachedPrice(asset, quote);
}

/**
 * Get mainnet price (for UI display)
 */
export async function getMainnetAssetPrice(asset: string): Promise<number | null> {
  return getMainnetPrice(asset);
}

// ============ Strategy Templates ============

/**
 * Pre-built strategy templates for common trading patterns
 */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'stop-loss',
    name: 'Stop-Loss',
    description: 'Automatically sell when price drops below a threshold',
    category: 'stop-loss',
    blocks: [
      {
        id: 'trigger-stop-loss',
        type: 'trigger_price',
        label: 'Price Drop Trigger',
        position: { x: 100, y: 100 },
        data: { subType: 'price_trigger' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'condition', type: 'string', value: 'below' },
          { id: 'p3', name: 'price', type: 'number', value: 0.20 },
        ],
      },
      {
        id: 'action-sell',
        type: 'action_sell',
        label: 'Sell All',
        position: { x: 400, y: 100 },
        data: { subType: 'sell' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '100' },
        ],
      },
    ],
    connections: [
      { id: 'c1', source: 'trigger-stop-loss', target: 'action-sell' },
    ],
    defaultConfig: {
      pollInterval: 15000,
      autoExecute: true,
      notifyOnTrigger: true,
      dailyLimit: 1,
    },
  },
  {
    id: 'take-profit',
    name: 'Take Profit',
    description: 'Automatically sell when price rises above a threshold',
    category: 'take-profit',
    blocks: [
      {
        id: 'trigger-take-profit',
        type: 'trigger_price',
        label: 'Price Rise Trigger',
        position: { x: 100, y: 100 },
        data: { subType: 'price_trigger' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'condition', type: 'string', value: 'above' },
          { id: 'p3', name: 'price', type: 'number', value: 0.30 },
        ],
      },
      {
        id: 'action-sell',
        type: 'action_sell',
        label: 'Sell & Take Profit',
        position: { x: 400, y: 100 },
        data: { subType: 'sell' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '50' },
        ],
      },
    ],
    connections: [
      { id: 'c1', source: 'trigger-take-profit', target: 'action-sell' },
    ],
    defaultConfig: {
      pollInterval: 15000,
      autoExecute: true,
      notifyOnTrigger: true,
      dailyLimit: 1,
    },
  },
  {
    id: 'dca-time',
    name: 'Dollar Cost Averaging (Time-based)',
    description: 'Buy fixed amount at regular intervals',
    category: 'dca',
    blocks: [
      {
        id: 'trigger-interval',
        type: 'trigger_time',
        label: 'Interval Trigger',
        position: { x: 100, y: 100 },
        data: { subType: 'time_trigger' },
        parameters: [
          { id: 'p1', name: 'interval', type: 'string', value: '1d' },
        ],
      },
      {
        id: 'action-buy',
        type: 'action_buy',
        label: 'Buy XLM',
        position: { x: 400, y: 100 },
        data: { subType: 'buy' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '10' },
        ],
      },
    ],
    connections: [
      { id: 'c1', source: 'trigger-interval', target: 'action-buy' },
    ],
    defaultConfig: {
      pollInterval: 3600000, // 1 hour
      autoExecute: true,
      notifyOnTrigger: true,
      dailyLimit: 1,
    },
  },
  {
    id: 'dca-dip',
    name: 'Buy the Dip',
    description: 'Buy when price drops below a threshold',
    category: 'dca',
    blocks: [
      {
        id: 'trigger-dip',
        type: 'trigger_price',
        label: 'Dip Trigger',
        position: { x: 100, y: 100 },
        data: { subType: 'price_trigger' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'condition', type: 'string', value: 'below' },
          { id: 'p3', name: 'price', type: 'number', value: 0.20 },
        ],
      },
      {
        id: 'action-buy',
        type: 'action_buy',
        label: 'Buy on Dip',
        position: { x: 400, y: 100 },
        data: { subType: 'buy' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '50' },
        ],
      },
    ],
    connections: [
      { id: 'c1', source: 'trigger-dip', target: 'action-buy' },
    ],
    defaultConfig: {
      pollInterval: 30000,
      autoExecute: true,
      notifyOnTrigger: true,
      dailyLimit: 3,
    },
  },
  {
    id: 'grid-trading',
    name: 'Grid Trading',
    description: 'Buy at support and sell at resistance levels',
    category: 'grid',
    blocks: [
      {
        id: 'trigger-buy-level',
        type: 'trigger_price',
        label: 'Buy Level',
        position: { x: 100, y: 100 },
        data: { subType: 'price_trigger' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'condition', type: 'string', value: 'below' },
          { id: 'p3', name: 'price', type: 'number', value: 0.20 },
        ],
      },
      {
        id: 'action-grid-buy',
        type: 'action_buy',
        label: 'Grid Buy',
        position: { x: 400, y: 100 },
        data: { subType: 'buy' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '20' },
        ],
      },
      {
        id: 'trigger-sell-level',
        type: 'trigger_price',
        label: 'Sell Level',
        position: { x: 100, y: 250 },
        data: { subType: 'price_trigger' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'condition', type: 'string', value: 'above' },
          { id: 'p3', name: 'price', type: 'number', value: 0.25 },
        ],
      },
      {
        id: 'action-grid-sell',
        type: 'action_sell',
        label: 'Grid Sell',
        position: { x: 400, y: 250 },
        data: { subType: 'sell' },
        parameters: [
          { id: 'p1', name: 'asset', type: 'string', value: 'XLM' },
          { id: 'p2', name: 'amount', type: 'string', value: '20' },
        ],
      },
    ],
    connections: [
      { id: 'c1', source: 'trigger-buy-level', target: 'action-grid-buy' },
      { id: 'c2', source: 'trigger-sell-level', target: 'action-grid-sell' },
    ],
    defaultConfig: {
      pollInterval: 15000,
      autoExecute: true,
      notifyOnTrigger: true,
      dailyLimit: 10,
    },
  },
];

/**
 * Get all strategy templates
 */
export function getStrategyTemplates(): StrategyTemplate[] {
  return STRATEGY_TEMPLATES;
}

/**
 * Create an agent from a strategy template
 */
export function createAgentFromTemplate(
  templateId: string,
  customizations?: {
    name?: string;
    description?: string;
    parameterOverrides?: Record<string, Record<string, any>>; // blockId -> { paramName: value }
    configOverrides?: Partial<ExecutionConfig>;
  }
): Agent | null {
  const template = STRATEGY_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    console.warn(`[AgentRunner] Template not found: ${templateId}`);
    return null;
  }

  // Deep clone blocks and connections
  const blocks = JSON.parse(JSON.stringify(template.blocks)) as AgentBlock[];
  const connections = JSON.parse(JSON.stringify(template.connections)) as BlockConnection[];

  // Apply parameter overrides
  if (customizations?.parameterOverrides) {
    for (const [blockId, overrides] of Object.entries(customizations.parameterOverrides)) {
      const block = blocks.find(b => b.id === blockId);
      if (block && block.parameters) {
        for (const [paramName, value] of Object.entries(overrides)) {
          const param = block.parameters.find(p => p.name === paramName);
          if (param) {
            param.value = value;
          }
        }
      }
    }
  }

  // Create agent
  const agent: Agent = {
    id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: customizations?.name || template.name,
    description: customizations?.description || template.description,
    blocks,
    connections,
    isActive: false,
    status: 'draft',
    executionConfig: {
      ...getDefaultConfig(),
      ...template.defaultConfig,
      ...customizations?.configOverrides,
    },
  };

  console.log(`[AgentRunner] Created agent from template: ${template.name}`, agent);
  return agent;
}

/**
 * Quick-start a mock demo with a strategy template
 */
export async function startMockDemo(templateId: string, customizations?: {
  targetPrice?: number;
  asset?: string;
  amount?: string;
}): Promise<{ success: boolean; agentId?: string; error?: string }> {
  const overrides: Record<string, Record<string, any>> = {};
  
  // Apply customizations to first trigger and action blocks
  const template = STRATEGY_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return { success: false, error: `Template not found: ${templateId}` };
  }

  const triggerBlock = template.blocks.find(b => b.type.includes('trigger'));
  const actionBlock = template.blocks.find(b => b.type.includes('action'));

  if (triggerBlock && customizations?.targetPrice) {
    overrides[triggerBlock.id] = { price: customizations.targetPrice };
    if (customizations.asset) {
      overrides[triggerBlock.id].asset = customizations.asset;
    }
  }

  if (actionBlock) {
    if (customizations?.asset) {
      overrides[actionBlock.id] = { asset: customizations.asset };
    }
    if (customizations?.amount) {
      overrides[actionBlock.id] = { ...overrides[actionBlock.id], amount: customizations.amount };
    }
  }

  const agent = createAgentFromTemplate(templateId, {
    name: `Demo: ${template.name}`,
    parameterOverrides: overrides,
    configOverrides: {
      useMockExecution: true,
      useMainnetPrices: true,
      pollInterval: 10000, // 10 seconds for demo
    },
  });

  if (!agent) {
    return { success: false, error: 'Failed to create agent from template' };
  }

  const result = startAgent(agent);
  if (result.success) {
    return { success: true, agentId: agent.id };
  }

  return result;
}
