import { Agent, AgentBlock, BlockConnection } from '../../types/agent-builder';
import { generateBlockId, generateConnectionId } from './storage';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
}

export interface ExecutionRequest {
  action: 'swap' | 'transfer' | 'portfolio';
  params: {
    fromAsset?: string;
    toAsset?: string;
    amount?: string;
    slippage?: number;
    destination?: string;
  };
}

interface ChatResponse {
  content: string;
  blocks: AgentBlock[];
  connections: BlockConnection[];
  suggestions: string[];
  executeNow?: boolean;
  execution?: ExecutionRequest;
}

interface RawBlockResponse {
  type: string;
  subType: string;
  label: string;
  description?: string;
  parameters?: Array<{
    name: string;
    value: string | number | boolean;
    type: string;
  }>;
}

interface RawConnectionResponse {
  sourceIndex: number;
  targetIndex: number;
  type?: string;
}

const SYSTEM_PROMPT = `You are an expert trading bot builder assistant for a DEX (Decentralized Exchange).
Help users create automated trading strategies using visual blocks OR execute trades directly.

IMPORTANT: You can either CREATE BLOCKS for strategy building OR EXECUTE trades immediately.

For IMMEDIATE EXECUTION (when user says "swap", "send", "execute", "trade now", etc.):
Set "executeNow": true and include execution details in "execution" field.

For BUILDING STRATEGIES (when user wants to create a bot or automation):
Set "executeNow": false and include blocks in "blocks" field.

Available block types for BUILDING:
1. TRIGGERS (type: "trigger"): price_trigger, time_trigger, event_trigger, volume_trigger
2. CONDITIONS (type: "condition"): price_condition, balance_condition, time_condition
3. ACTIONS (type: "action"): buy, sell, swap, limit_order, stop_loss, take_profit
4. STRATEGIES (type: "strategy"): dca, grid_trading, arbitrage, rebalancing
5. INDICATORS (type: "indicator"): moving_average, rsi, macd, bollinger_bands

For IMMEDIATE EXECUTION, supported actions:
- swap: Swap tokens (fromAsset, toAsset, amount, slippage)
- transfer: Send XLM (destination, amount)
- portfolio: Get wallet balances

CRITICAL: Always respond in valid JSON format with this structure:
{
  "message": "Your helpful response text",
  "executeNow": true/false,
  "execution": {
    "action": "swap" | "transfer" | "portfolio",
    "params": {
      "fromAsset": "XLM",
      "toAsset": "USDC", 
      "amount": "10",
      "slippage": 3,
      "destination": "G...",
    }
  },
  "blocks": [array of blocks if building a strategy],
  "connections": [array of connections between blocks by index],
  "suggestions": [array of 3 helpful next action suggestions]
}

Examples:
- "swap 10 XLM to USDC" → executeNow: true, action: "swap", params: {fromAsset: "XLM", toAsset: "USDC", amount: "10"}
- "send 5 XLM to GABC..." → executeNow: true, action: "transfer", params: {destination: "GABC...", amount: "5"}
- "check my balance" → executeNow: true, action: "portfolio"
- "create a DCA bot" → executeNow: false, blocks: [...], connections: [...]

Block structure for BUILDING:
{
  "type": "action",
  "subType": "swap",
  "label": "Swap XLM to USDC",
  "description": "Swap tokens on DEX",
  "parameters": [
    {"name": "fromAsset", "value": "XLM", "type": "text"},
    {"name": "toAsset", "value": "USDC", "type": "text"},
    {"name": "amount", "value": 10, "type": "number"}
  ]
}

Respond with helpful explanations. Be smart about detecting user intent!`;

// Block type colors and icons mapping
const BLOCK_TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  trigger: { color: '#22c55e', icon: 'Zap' },
  condition: { color: '#f59e0b', icon: 'GitBranch' },
  action: { color: '#3b82f6', icon: 'Play' },
  strategy: { color: '#8b5cf6', icon: 'TrendingUp' },
  indicator: { color: '#06b6d4', icon: 'BarChart2' },
  loop: { color: '#ec4899', icon: 'RefreshCw' },
  delay: { color: '#64748b', icon: 'Clock' },
};

function transformBlocksResponse(
  rawBlocks: RawBlockResponse[],
  existingBlocksCount: number
): AgentBlock[] {
  return rawBlocks.map((block, index) => {
    const config = BLOCK_TYPE_CONFIG[block.type] || { color: '#6b7280', icon: 'Box' };

    return {
      id: generateBlockId(),
      type: block.type,
      label: block.label,
      description: block.description,
      position: {
        x: 100,
        y: 100 + (existingBlocksCount + index) * 150,
      },
      data: {
        subType: block.subType,
        parameters: block.parameters || [],
      },
      color: config.color,
      icon: config.icon,
      isValid: true,
    };
  });
}

function transformConnectionsResponse(
  rawConnections: RawConnectionResponse[],
  blocks: AgentBlock[]
): BlockConnection[] {
  return rawConnections
    .filter(conn =>
      conn.sourceIndex >= 0 &&
      conn.sourceIndex < blocks.length &&
      conn.targetIndex >= 0 &&
      conn.targetIndex < blocks.length
    )
    .map((conn) => ({
      id: generateConnectionId(),
      source: blocks[conn.sourceIndex].id,
      target: blocks[conn.targetIndex].id,
      type: conn.type || 'default',
    }));
}

export async function sendChatMessage(
  message: string,
  conversationHistory: Message[],
  currentAgent: Agent
): Promise<ChatResponse> {
  // Get API key from localStorage or use a default (for development)
  const apiKey = localStorage.getItem('openrouter-api-key') || '';

  if (!apiKey) {
    // Return a helpful message if no API key is set
    return {
      content: "To use the AI assistant, please set your OpenRouter API key. You can get a free API key from openrouter.ai and save it in the extension settings.",
      blocks: [],
      connections: [],
      suggestions: [
        'Get API key from openrouter.ai',
        'Check extension settings',
        'Try manual block creation',
      ],
    };
  }

  const messages = [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT,
    },
    // Add last 6 messages for context
    ...conversationHistory.slice(-6).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: message,
    },
    {
      role: 'system' as const,
      content: `Current agent has ${currentAgent.blocks?.length || 0} blocks. Agent name: ${currentAgent.name}`,
    },
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'chrome-extension://nebula-dex',
        'X-Title': 'Nebula DEX Agent Builder',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '{}';

    try {
      const parsedResponse = JSON.parse(responseText);

      // Transform blocks if present
      let transformedBlocks: AgentBlock[] = [];
      let transformedConnections: BlockConnection[] = [];

      if (parsedResponse.blocks && Array.isArray(parsedResponse.blocks) && parsedResponse.blocks.length > 0) {
        transformedBlocks = transformBlocksResponse(
          parsedResponse.blocks,
          currentAgent.blocks?.length || 0
        );

        if (parsedResponse.connections && Array.isArray(parsedResponse.connections)) {
          transformedConnections = transformConnectionsResponse(
            parsedResponse.connections,
            transformedBlocks
          );
        }
      }

      return {
        content: parsedResponse.message || 'I processed your request.',
        blocks: transformedBlocks,
        connections: transformedConnections,
        suggestions: parsedResponse.suggestions || [
          'Create a DCA bot',
          'Add a stop loss',
          'Build a grid strategy',
        ],
        executeNow: parsedResponse.executeNow || false,
        execution: parsedResponse.execution || undefined,
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return {
        content: responseText || 'I encountered an issue processing the response.',
        blocks: [],
        connections: [],
        suggestions: [
          'Try rephrasing your request',
          'Create a DCA bot',
          'Build a simple strategy',
        ],
      };
    }
  } catch (error) {
    console.error('Chat API error:', error);
    throw error;
  }
}

// Helper to save/retrieve API key
export function saveApiKey(key: string): void {
  localStorage.setItem('openrouter-api-key', key);
}

export function getApiKey(): string | null {
  return localStorage.getItem('openrouter-api-key');
}

export function hasApiKey(): boolean {
  return !!localStorage.getItem('openrouter-api-key');
}
