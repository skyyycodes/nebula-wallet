import React, { useState, useEffect, useCallback } from 'react';
import { Agent, AgentBlock, BlockConnection } from '../types/agent-builder';
import { AgentStorageManager, generateAgentId } from '../lib/agent-builder/storage';
import AgentToolbar from '../components/agent-builder/AgentToolbar';
import BlockPalette from '../components/agent-builder/BlockPalette';
import FlowCanvas from '../components/agent-builder/FlowCanvas';
import ChatSidebar from '../components/agent-builder/ChatSidebar';
import ExecutionLogsPanel from '../components/agent-builder/ExecutionLogsPanel';
import { LayoutGrid, MessageSquare, Activity } from 'lucide-react';
import { useBlockExecutor, ExecutionResult, executeChatCommand } from '../hooks/useBlockExecutor';
import { ExecutionRequest } from '../lib/agent-builder/chat-service';

interface AgentBuilderProps {
  onBack?: () => void;
}

export function AgentBuilder({ onBack }: AgentBuilderProps) {
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [blockResults, setBlockResults] = useState<Map<string, ExecutionResult>>(new Map());

  // Block executor hook
  const { executeBlock, isExecuting, executingBlockId } = useBlockExecutor();

  // Handle block execution
  const handleBlockExecute = useCallback(async (blockId: string) => {
    if (!currentAgent) return;

    const block = currentAgent.blocks.find(b => b.id === blockId);
    if (!block) return;

    const result = await executeBlock(block);

    // Store result for this block
    setBlockResults(prev => {
      const newResults = new Map(prev);
      newResults.set(blockId, result);
      return newResults;
    });
  }, [currentAgent, executeBlock]);

  // Handle chat execution (for direct commands like "swap 10 XLM to USDC")
  const handleChatExecute = useCallback(async (execution: ExecutionRequest): Promise<ExecutionResult> => {
    return executeChatCommand(execution);
  }, []);

  // Initialize or load agent
  useEffect(() => {
    const activeAgentId = AgentStorageManager.getActiveAgentId();
    let agent: Agent | null = null;

    if (activeAgentId) {
      agent = AgentStorageManager.loadAgent(activeAgentId);
    }

    if (!agent) {
      // Create new agent
      agent = createNewAgent();
      AgentStorageManager.saveAgent(agent);
      AgentStorageManager.setActiveAgent(agent.id);
    }

    setCurrentAgent(agent);
  }, []);

  // Auto-save agent on changes
  useEffect(() => {
    if (currentAgent) {
      const timeoutId = setTimeout(() => {
        AgentStorageManager.saveAgent(currentAgent);
      }, 1000); // Debounce saves by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [currentAgent]);

  const createNewAgent = (): Agent => {
    return {
      id: generateAgentId(),
      name: 'New Trading Agent',
      description: 'A custom trading agent',
      blocks: [],
      connections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: false,
      status: 'draft',
      executionCount: 0,
      tags: [],
    };
  };

  const handleAgentUpdate = useCallback((updates: Partial<Agent>) => {
    setCurrentAgent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (currentAgent) {
      AgentStorageManager.saveAgent(currentAgent);
      alert('Agent saved successfully');
    }
  }, [currentAgent]);

  const handleReset = useCallback(() => {
    setCurrentAgent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: [],
        connections: [],
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const handleBlocksGenerated = useCallback((blocks: AgentBlock[], connections: BlockConnection[]) => {
    if (!currentAgent) return;

    setCurrentAgent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: [...prev.blocks, ...blocks],
        connections: [...prev.connections, ...connections],
        updatedAt: new Date().toISOString(),
      };
    });

    const connectionText = connections.length > 0 ? ` and ${connections.length} connection(s)` : '';
    alert(`Added ${blocks.length} block(s)${connectionText} to canvas`);
  }, [currentAgent]);

  if (!currentAgent) {
    return (
      <div className="agent-builder-loading">
        <div className="loading-spinner" />
        <p>Loading Agent Builder...</p>
      </div>
    );
  }

  return (
    <div className="agent-builder">
      {/* Toolbar */}
      <div className="agent-builder-toolbar">
        <AgentToolbar
          agent={currentAgent}
          onAgentUpdate={handleAgentUpdate}
          onSave={handleSave}
          onReset={handleReset}
        />
        {/* Chat Toggle Button */}
        <button
          className={`chat-toggle-btn ${isChatOpen ? 'active' : ''}`}
          onClick={() => setIsChatOpen(!isChatOpen)}
          title={isChatOpen ? 'Close AI Chat' : 'Open AI Chat'}
        >
          <MessageSquare size={18} />
          <span>AI Chat</span>
        </button>
        {/* Logs Toggle Button */}
        <button
          className={`chat-toggle-btn ${isLogsOpen ? 'active' : ''}`}
          onClick={() => setIsLogsOpen(!isLogsOpen)}
          title={isLogsOpen ? 'Close Logs' : 'View Execution Logs'}
        >
          <Activity size={18} />
          <span>Logs</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="agent-builder-content">
        {/* Block Palette */}
        {!isPaletteCollapsed && (
          <div className="agent-builder-palette">
            <BlockPalette onToggleCollapse={() => setIsPaletteCollapsed(true)} />
          </div>
        )}

        {/* Flow Canvas */}
        <div className={`agent-builder-canvas ${isChatOpen ? 'with-chat' : ''}`}>
          <FlowCanvas
            agent={currentAgent}
            onAgentUpdate={handleAgentUpdate}
            onBlockExecute={handleBlockExecute}
            executingBlockId={executingBlockId}
            blockResults={blockResults}
          />

          {/* Collapse/Expand Button */}
          {isPaletteCollapsed && (
            <button
              className="palette-expand-btn"
              onClick={() => setIsPaletteCollapsed(false)}
              title="Show Block Palette"
            >
              <LayoutGrid size={20} />
            </button>
          )}
        </div>

        {/* Chat Sidebar */}
        {isChatOpen && (
          <div className="agent-builder-chat">
            <ChatSidebar
              currentAgent={currentAgent}
              onBlocksGenerated={handleBlocksGenerated}
              onClose={() => setIsChatOpen(false)}
              onExecuteAction={handleChatExecute}
            />
          </div>
        )}
      </div>

      {/* Execution Logs Panel */}
      <ExecutionLogsPanel
        agentId={currentAgent.id}
        isVisible={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />
    </div>
  );
}
