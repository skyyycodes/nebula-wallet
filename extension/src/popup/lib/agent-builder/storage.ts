import { Agent } from '../../types/agent-builder';

class StorageManager {
  private storageKey = 'nebula-agents';

  saveAgent(agent: Agent): void {
    if (typeof window === 'undefined') return;
    const agents = this.getAllAgents();
    const index = agents.findIndex(a => a.id === agent.id);
    if (index >= 0) {
      agents[index] = agent;
    } else {
      agents.push(agent);
    }
    localStorage.setItem(this.storageKey, JSON.stringify(agents));
  }

  loadAgent(id: string): Agent | null {
    const agents = this.getAllAgents();
    return agents.find(a => a.id === id) || null;
  }

  getAllAgents(): Agent[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : [];
  }

  deleteAgent(id: string): void {
    if (typeof window === 'undefined') return;
    const agents = this.getAllAgents().filter(a => a.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(agents));
  }

  getActiveAgentId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-agent-id');
  }

  setActiveAgent(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('active-agent-id', id);
  }

  duplicateAgent(agent: Agent): Agent {
    const newAgent = {
      ...agent,
      id: generateAgentId(),
      name: `${agent.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.saveAgent(newAgent);
    return newAgent;
  }

  exportAgent(agent: Agent): string {
    return JSON.stringify(agent, null, 2);
  }

  importAgent(jsonString: string): Agent {
    const agent = JSON.parse(jsonString) as Agent;
    agent.id = generateAgentId();
    agent.createdAt = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();
    this.saveAgent(agent);
    return agent;
  }
}

export const AgentStorageManager = new StorageManager();

export function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateConnectionId(): string {
  return `connection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Simple validator
export class AgentValidator {
  static validate(agent: Agent): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!agent.name || agent.name.trim() === '') {
      errors.push('Agent name is required');
    }

    if (agent.blocks.length === 0) {
      errors.push('Agent must have at least one block');
    }

    // Check for trigger blocks
    const hasTrigger = agent.blocks.some(b => b.type.startsWith('trigger'));
    if (!hasTrigger && agent.blocks.length > 0) {
      warnings.push('Agent has no trigger block');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
