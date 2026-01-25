"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Agent, AgentBlock, BlockConnection } from "@/types/agent-builder";
import {
  AgentStorageManager,
  generateAgentId,
} from "@/lib/agent-builder/storage";
import {
  AgentToolbar,
  BlockPalette,
  FlowCanvas,
  ChatSidebar,
} from "@/components/agent-builder";
import AgentManager from "@/components/agent-builder/AgentManager";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useChatContext } from "@/components/providers/chat-provider";

export default function AgentBuilderPage() {
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const { openChat, setAgentBuilderMode } = useChatContext();

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
      name: "New Trading Agent",
      description: "A custom trading agent",
      blocks: [],
      connections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: false,
      status: "draft",
      executionCount: 0,
      tags: [],
    };
  };

  const handleCreateNewAgent = useCallback(() => {
    const newAgent = createNewAgent();
    AgentStorageManager.saveAgent(newAgent);
    AgentStorageManager.setActiveAgent(newAgent.id);
    setCurrentAgent(newAgent);
  }, []);

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
      toast.success("Agent saved successfully");
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

  const handleBlocksGenerated = useCallback(
    (blocks: any[], connections: any[]) => {
      if (!currentAgent) return;

      // Convert chat blocks to AgentBlocks with proper format
      const agentBlocks: AgentBlock[] = blocks.map((block, index) => {
        // Auto-layout blocks vertically with spacing
        const yPosition = (currentAgent.blocks.length + index) * 150;
        const xPosition = 300;

        return {
          id: `block_${Date.now()}_${index}`,
          type: block.type,
          label: block.label,
          position: { x: xPosition, y: yPosition },
          data: block.parameters?.reduce((acc: any, param: any) => {
            acc[param.name] = param.value;
            return acc;
          }, {}) || {},
          parameters: block.parameters?.map((param: any, pIdx: number) => ({
            id: `param_${pIdx}`,
            name: param.name,
            type: param.type,
            value: param.value,
            required: true,
          })) || [],
          isValid: true,
          icon: getIconForBlockType(block.type, block.subType),
          description: block.description,
          color: getColorForBlockType(block.type),
        };
      });

      // Convert connections to use generated block IDs
      const agentConnections: BlockConnection[] = connections.map((conn) => ({
        id: `conn_${Date.now()}_${conn.sourceIndex}_${conn.targetIndex}`,
        source: agentBlocks[conn.sourceIndex]?.id || '',
        target: agentBlocks[conn.targetIndex]?.id || '',
        type: conn.type || 'default',
      }));

      setCurrentAgent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          blocks: [...prev.blocks, ...agentBlocks],
          connections: [...prev.connections, ...agentConnections],
          updatedAt: new Date().toISOString(),
        };
      });

      const connectionText =
        agentConnections.length > 0
          ? ` and ${agentConnections.length} connection(s)`
          : "";
      toast.success(
        `Added ${agentBlocks.length} block(s)${connectionText} to canvas`,
      );
    },
    [currentAgent],
  );

  // Helper functions for block styling
  const getIconForBlockType = (type: string, subType?: string) => {
    const iconMap: Record<string, string> = {
      trigger: 'Zap',
      condition: 'GitCompare',
      action: 'Play',
      strategy: 'Target',
      indicator: 'TrendingUp',
      loop: 'Repeat',
      delay: 'Clock',
    };
    return iconMap[type] || 'Box';
  };

  const getColorForBlockType = (type: string) => {
    const colorMap: Record<string, string> = {
      trigger: '#10b981',
      condition: '#f59e0b',
      action: '#3b82f6',
      strategy: '#8b5cf6',
      indicator: '#ec4899',
      loop: '#06b6d4',
      delay: '#6366f1',
    };
    return colorMap[type] || '#6366f1';
  };

  // Clean up chat provider mode (we're using integrated chat now)
  useEffect(() => {
    return () => {
      setAgentBuilderMode(false);
    };
  }, [setAgentBuilderMode]);

  if (!currentAgent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Agent Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden pt-6 pl-6 pr-6 pb-6">
      {/* Main Glass Container */}
      <div className="h-full flex flex-col glass-card rounded-xl border border-border/50 overflow-hidden">
        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-stretch border-b border-border/50">
          <div className="flex-1">
            <AgentToolbar
              agent={currentAgent}
              onAgentUpdate={handleAgentUpdate}
              onSave={handleSave}
              onReset={handleReset}
            />
          </div>
          <div className="flex items-center px-4">
            <AgentManager
              currentAgent={currentAgent}
              onSelectAgent={(agent) => setCurrentAgent(agent)}
              onCreateNew={handleCreateNewAgent}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* @ts-ignore - direction prop is valid for react-resizable-panels */}
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Block Palette */}
            {!isPaletteCollapsed && (
              <>
                <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                  <BlockPalette
                    onToggleCollapse={() => setIsPaletteCollapsed(true)}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* Flow Canvas */}
            <ResizablePanel minSize={30}>
              <div className="relative h-full">
                <FlowCanvas
                  agent={currentAgent}
                  onAgentUpdate={handleAgentUpdate}
                />

                {/* Collapse/Expand Buttons */}
                {isPaletteCollapsed && (
                  <button
                    onClick={() => setIsPaletteCollapsed(false)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-card border-2 border-primary/20 shadow-xl hover:bg-primary/10 hover:border-primary/40 transition-all hover:scale-110 group"
                    title="Show Block Palette"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary group-hover:translate-x-1 transition-transform"
                    >
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </button>
                )}

                {/* Chat Toggle Button */}
                {!isChatOpen && (
                  <Button
                    onClick={() => setIsChatOpen(true)}
                    className="absolute right-4 top-4 z-10 shadow-xl"
                    size="sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Open AI Chat
                  </Button>
                )}
              </div>
            </ResizablePanel>

            {/* Chat Sidebar */}
            {isChatOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                  <ChatSidebar
                    currentAgent={currentAgent}
                    onBlocksGenerated={handleBlocksGenerated}
                    onClose={() => setIsChatOpen(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
