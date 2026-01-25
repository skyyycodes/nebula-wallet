import { BlockParameter } from '../../types/agent-builder';

export const BLOCK_CATEGORIES = [
  'All',
  'Triggers',
  'Conditions',
  'Actions',
  'Data',
  'Integrations',
] as const;

export type BlockCategory = typeof BLOCK_CATEGORIES[number];

export interface BlockTemplate {
  type: string;
  label: string;
  description: string;
  category: BlockCategory;
  icon: string;
  defaultData: Record<string, any>;
  defaultParameters?: BlockParameter[];
  color?: string;
  inputs?: number;
  outputs?: number;
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  // Triggers
  {
    type: 'trigger_price',
    label: 'Price Trigger',
    description: 'Trigger when asset reaches a specific price',
    category: 'Triggers',
    icon: 'DollarSign',
    color: '#10b981',
    defaultData: {
      asset: 'XLM',
      condition: 'above',
      price: 0,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'asset',
        type: 'select',
        value: 'XLM',
        required: true,
        description: 'The asset to monitor',
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
      {
        id: 'param_2',
        name: 'condition',
        type: 'select',
        value: 'above',
        required: true,
        description: 'Price condition',
        options: ['above', 'below', 'equals'],
      },
      {
        id: 'param_3',
        name: 'price',
        type: 'number',
        value: 0,
        required: true,
        placeholder: 'Enter target price',
        description: 'Target price to trigger at',
        min: 0,
        step: 0.01,
      },
    ],
    inputs: 0,
    outputs: 1,
  },
  {
    type: 'trigger_time',
    label: 'Time Trigger',
    description: 'Trigger at specific time intervals',
    category: 'Triggers',
    icon: 'Clock',
    color: '#3b82f6',
    defaultData: {
      interval: '1h',
      enabled: true,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'interval',
        type: 'select',
        value: '1h',
        required: true,
        description: 'Time interval',
        options: ['1m', '5m', '15m', '1h', '4h', '1d'],
      },
    ],
    inputs: 0,
    outputs: 1,
  },
  {
    type: 'trigger_indicator',
    label: 'Indicator Trigger',
    description: 'Trigger based on technical indicators',
    category: 'Triggers',
    icon: 'TrendingUp',
    color: '#8b5cf6',
    defaultData: {
      indicator: 'RSI',
      condition: 'above',
      value: 70,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'indicator',
        type: 'select',
        value: 'RSI',
        required: true,
        options: ['RSI', 'MACD', 'SMA', 'EMA'],
      },
      {
        id: 'param_2',
        name: 'condition',
        type: 'select',
        value: 'above',
        required: true,
        options: ['above', 'below', 'crosses_above', 'crosses_below'],
      },
      {
        id: 'param_3',
        name: 'value',
        type: 'number',
        value: 70,
        required: true,
      },
    ],
    inputs: 0,
    outputs: 1,
  },

  // Conditions
  {
    type: 'condition_compare',
    label: 'Compare',
    description: 'Compare two values',
    category: 'Conditions',
    icon: 'GitCompare',
    color: '#f59e0b',
    defaultData: {
      operator: 'greater_than',
      valueA: 0,
      valueB: 0,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'operator',
        type: 'select',
        value: 'greater_than',
        required: true,
        options: ['greater_than', 'less_than', 'equals', 'not_equals'],
      },
    ],
    inputs: 1,
    outputs: 2,
  },
  {
    type: 'condition_and',
    label: 'AND Gate',
    description: 'All conditions must be true',
    category: 'Conditions',
    icon: 'GitMerge',
    color: '#06b6d4',
    defaultData: {},
    inputs: 2,
    outputs: 1,
  },
  {
    type: 'condition_or',
    label: 'OR Gate',
    description: 'At least one condition must be true',
    category: 'Conditions',
    icon: 'GitBranch',
    color: '#14b8a6',
    defaultData: {},
    inputs: 2,
    outputs: 1,
  },

  // Actions
  {
    type: 'action_buy',
    label: 'Buy Order',
    description: 'Execute a buy order',
    category: 'Actions',
    icon: 'TrendingUp',
    color: '#10b981',
    defaultData: {
      asset: 'XLM',
      amount: 0,
      orderType: 'market',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'asset',
        type: 'select',
        value: 'XLM',
        required: true,
        description: 'The asset to buy',
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
      {
        id: 'param_2',
        name: 'amount',
        type: 'number',
        value: 0,
        required: true,
        placeholder: 'Enter amount',
        description: 'Amount to buy',
        min: 0,
        step: 0.01,
      },
      {
        id: 'param_3',
        name: 'orderType',
        type: 'select',
        value: 'market',
        required: true,
        description: 'Type of order',
        options: ['market', 'limit'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_sell',
    label: 'Sell Order',
    description: 'Execute a sell order',
    category: 'Actions',
    icon: 'TrendingDown',
    color: '#ef4444',
    defaultData: {
      asset: 'XLM',
      amount: 0,
      orderType: 'market',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'asset',
        type: 'select',
        value: 'XLM',
        required: true,
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
      {
        id: 'param_2',
        name: 'amount',
        type: 'number',
        value: 0,
        required: true,
        min: 0,
        step: 0.01,
      },
      {
        id: 'param_3',
        name: 'orderType',
        type: 'select',
        value: 'market',
        required: true,
        options: ['market', 'limit'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_swap',
    label: 'Swap Assets',
    description: 'Swap between two assets',
    category: 'Actions',
    icon: 'ArrowLeftRight',
    color: '#6366f1',
    defaultData: {
      fromAsset: 'XLM',
      toAsset: 'USDC',
      amount: 0,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'fromAsset',
        type: 'select',
        value: 'XLM',
        required: true,
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
      {
        id: 'param_2',
        name: 'toAsset',
        type: 'select',
        value: 'USDC',
        required: true,
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
      {
        id: 'param_3',
        name: 'amount',
        type: 'number',
        value: 0,
        required: true,
        min: 0,
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_notify',
    label: 'Send Notification',
    description: 'Send a notification or alert',
    category: 'Actions',
    icon: 'Bell',
    color: '#f59e0b',
    defaultData: {
      message: '',
      channel: 'email',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'message',
        type: 'text',
        value: '',
        required: true,
        placeholder: 'Notification message',
      },
      {
        id: 'param_2',
        name: 'channel',
        type: 'select',
        value: 'browser',
        required: true,
        options: ['browser', 'email', 'webhook'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_transfer',
    label: 'Transfer XLM',
    description: 'Transfer XLM to an address',
    category: 'Actions',
    icon: 'Send',
    color: '#ffd700',
    defaultData: {
      destinationAddress: '',
      amount: '0',
      token: 'XLM',
    },
    defaultParameters: [
      {
        id: 'param_dest',
        name: 'destinationAddress',
        type: 'text',
        value: '',
        required: true,
        placeholder: 'G...',
        description: 'Stellar address to send to',
      },
      {
        id: 'param_amount',
        name: 'amount',
        type: 'text',
        value: '0',
        required: true,
        placeholder: '10',
        description: 'Amount to transfer',
      },
      {
        id: 'param_token',
        name: 'token',
        type: 'select',
        value: 'XLM',
        required: true,
        description: 'Token to transfer',
        options: ['XLM'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_multi_send',
    label: 'Multi-Send',
    description: 'Send XLM to multiple recipients in one transaction',
    category: 'Actions',
    icon: 'Users',
    color: '#22c55e',
    defaultData: {
      recipients: [],
      memo: '',
    },
    defaultParameters: [
      {
        id: 'param_recipients',
        name: 'recipients',
        type: 'text',
        value: '',
        required: true,
        placeholder: 'GADDR1:10,GADDR2:20',
        description: 'Recipients as ADDRESS:AMOUNT pairs (comma-separated)',
      },
      {
        id: 'param_memo',
        name: 'memo',
        type: 'text',
        value: '',
        required: false,
        placeholder: 'Batch payment',
        description: 'Optional transaction memo',
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'action_webhook',
    label: 'Webhook',
    description: 'Send HTTP POST notification to a URL',
    category: 'Actions',
    icon: 'Webhook',
    color: '#ec4899',
    defaultData: {
      url: '',
      payload: {},
    },
    defaultParameters: [
      {
        id: 'param_url',
        name: 'url',
        type: 'text',
        value: '',
        required: true,
        placeholder: 'https://webhook.site/...',
        description: 'Webhook URL to POST to',
      },
      {
        id: 'param_payload',
        name: 'payload',
        type: 'text',
        value: '{}',
        required: false,
        placeholder: '{"key": "value"}',
        description: 'JSON payload to send',
      },
    ],
    inputs: 1,
    outputs: 1,
  },

  // Data
  {
    type: 'data_fetch_price',
    label: 'Fetch Price',
    description: 'Get current price of an asset',
    category: 'Data',
    icon: 'Database',
    color: '#8b5cf6',
    defaultData: {
      asset: 'XLM',
      source: 'stellar',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'asset',
        type: 'select',
        value: 'XLM',
        required: true,
        options: ['XLM', 'USDC', 'BTC', 'ETH'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'data_calculate',
    label: 'Calculate',
    description: 'Perform mathematical calculations',
    category: 'Data',
    icon: 'Calculator',
    color: '#06b6d4',
    defaultData: {
      operation: 'add',
      valueA: 0,
      valueB: 0,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'operation',
        type: 'select',
        value: 'add',
        required: true,
        options: ['add', 'subtract', 'multiply', 'divide', 'percentage'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'data_variable',
    label: 'Variable',
    description: 'Store and retrieve data',
    category: 'Data',
    icon: 'Box',
    color: '#64748b',
    defaultData: {
      name: 'variable1',
      value: null,
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'name',
        type: 'text',
        value: 'variable1',
        required: true,
      },
    ],
    inputs: 1,
    outputs: 1,
  },

  // Integrations
  {
    type: 'integration_stellar',
    label: 'Stellar Network',
    description: 'Interact with Stellar blockchain',
    category: 'Integrations',
    icon: 'Network',
    color: '#3b82f6',
    defaultData: {
      network: 'testnet',
      operation: 'payment',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'network',
        type: 'select',
        value: 'testnet',
        required: true,
        options: ['testnet', 'mainnet'],
      },
      {
        id: 'param_2',
        name: 'operation',
        type: 'select',
        value: 'payment',
        required: true,
        options: ['payment', 'trust', 'offer'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'integration_webhook',
    label: 'Webhook',
    description: 'Send data to external endpoint',
    category: 'Integrations',
    icon: 'Webhook',
    color: '#8b5cf6',
    defaultData: {
      url: '',
      method: 'POST',
    },
    defaultParameters: [
      {
        id: 'param_1',
        name: 'url',
        type: 'text',
        value: '',
        required: true,
        placeholder: 'https://...',
      },
      {
        id: 'param_2',
        name: 'method',
        type: 'select',
        value: 'POST',
        required: true,
        options: ['GET', 'POST', 'PUT'],
      },
    ],
    inputs: 1,
    outputs: 1,
  },
];

export function getBlockTemplate(type: string): BlockTemplate | undefined {
  return BLOCK_TEMPLATES.find(t => t.type === type);
}

export function getBlocksByCategory(category: BlockCategory): BlockTemplate[] {
  if (category === 'All') return BLOCK_TEMPLATES;
  return BLOCK_TEMPLATES.filter(t => t.category === category);
}
