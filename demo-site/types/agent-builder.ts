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
