export interface ExecutionConfig {
  pollInterval: number;       // Poll interval in milliseconds (default: 30000 = 30s)
  autoExecute: boolean;       // Execute automatically when triggered (vs notify only)
  notifyOnTrigger: boolean;   // Show notification when trigger fires
  dailyLimit: number;         // Max executions per day (0 = unlimited)
  maxSlippage: number;        // Max slippage percentage for swaps
  useMockExecution: boolean;  // Mock execution mode (simulates transactions)
  useMainnetPrices: boolean;  // Use mainnet prices for triggers (via CoinGecko)
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

export interface Agent {
  id: string;
  name: string;
  description: string;
  blocks: AgentBlock[];
  connections: BlockConnection[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  status: 'draft' | 'active' | 'paused';
  executionCount: number;
  tags: string[];
  executionConfig?: ExecutionConfig;
}

export interface AgentBlock {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  parameters?: BlockParameter[];
  isValid?: boolean;
  color?: string;
  icon?: string;
  description?: string;
  errors?: string[];
}

export interface BlockParameter {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'percentage';
  value: any;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface BlockConnection {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}
