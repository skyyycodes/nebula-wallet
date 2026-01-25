import React, { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Agent, AgentBlock } from '../../types/agent-builder';
import { generateBlockId, generateConnectionId } from '../../lib/agent-builder/storage';
import AgentBlockNode from './AgentBlockNode';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { ExecutionResult, isBlockExecutable } from '../../hooks/useBlockExecutor';

const nodeTypes = {
  agentBlock: AgentBlockNode,
};

interface FlowCanvasProps {
  agent: Agent;
  onAgentUpdate: (updates: Partial<Agent>) => void;
  onBlockExecute?: (blockId: string) => void;
  executingBlockId?: string | null;
  blockResults?: Map<string, ExecutionResult>;
}

function FlowCanvasInner({ agent, onAgentUpdate, onBlockExecute, executingBlockId, blockResults }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const handleBlockUpdate = useCallback((id: string, updates: Partial<AgentBlock>) => {
    const updatedBlocks = agent.blocks.map((block) =>
      block.id === id ? { ...block, ...updates } : block
    );
    onAgentUpdate({ blocks: updatedBlocks });
  }, [agent.blocks, onAgentUpdate]);

  const handleBlockDelete = useCallback((id: string) => {
    const updatedBlocks = agent.blocks.filter((block) => block.id !== id);
    const updatedConnections = agent.connections.filter(
      (conn) => conn.source !== id && conn.target !== id
    );
    onAgentUpdate({
      blocks: updatedBlocks,
      connections: updatedConnections,
    });
  }, [agent.blocks, agent.connections, onAgentUpdate]);

  const handleBlockExecute = useCallback((id: string) => {
    if (onBlockExecute) {
      onBlockExecute(id);
    }
  }, [onBlockExecute]);

  // Initialize nodes and edges from agent
  React.useEffect(() => {
    const flowNodes: Node[] = agent.blocks.map((block) => ({
      id: block.id,
      type: 'agentBlock',
      position: block.position,
      data: {
        ...block,
        onUpdate: handleBlockUpdate,
        onDelete: handleBlockDelete,
        onExecute: handleBlockExecute,
        isExecuting: executingBlockId === block.id,
        isExecutable: isBlockExecutable(block.type),
        lastResult: blockResults?.get(block.id) || null,
      },
    }));

    const flowEdges: Edge[] = agent.connections.map((conn) => ({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle,
      targetHandle: conn.targetHandle,
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      label: conn.label,
      style: {
        stroke: conn.type === 'error' ? '#ef4444' : conn.sourceHandle === 'true' ? '#10b981' : conn.sourceHandle === 'false' ? '#ef4444' : '#6366f1',
        strokeWidth: 2,
      },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [agent.blocks, agent.connections, handleBlockUpdate, handleBlockDelete, handleBlockExecute, executingBlockId, blockResults, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newConnection = {
        id: generateConnectionId(),
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle || undefined,
        targetHandle: params.targetHandle || undefined,
        type: 'default' as const,
      };

      const updatedConnections = [...agent.connections, newConnection];
      onAgentUpdate({ connections: updatedConnections });
    },
    [agent.connections, onAgentUpdate]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const templateData = event.dataTransfer.getData('application/reactflow');

      if (!templateData || !reactFlowBounds || !reactFlowInstance) {
        return;
      }

      const template = JSON.parse(templateData);
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newBlock: AgentBlock = {
        id: generateBlockId(),
        type: template.type,
        label: template.label,
        position,
        data: template.defaultData || {},
        parameters: template.defaultParameters || [],
        isValid: false,
        color: template.color,
        icon: template.icon,
        description: template.description,
      };

      const updatedBlocks = [...agent.blocks, newBlock];
      onAgentUpdate({ blocks: updatedBlocks });
    },
    [reactFlowInstance, agent.blocks, onAgentUpdate]
  );

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);

      // Update positions in agent data
      const positionChanges = changes.filter((change: any) => change.type === 'position' && change.position);
      if (positionChanges.length > 0) {
        const updatedBlocks = agent.blocks.map((block) => {
          const positionChange = positionChanges.find((change: any) => change.id === block.id);
          if (positionChange && positionChange.position) {
            return { ...block, position: positionChange.position };
          }
          return block;
        });
        onAgentUpdate({ blocks: updatedBlocks });
      }
    },
    [onNodesChange, agent.blocks, onAgentUpdate]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);

      // Handle edge removal
      const removedEdges = changes.filter((change: any) => change.type === 'remove');
      if (removedEdges.length > 0) {
        const updatedConnections = agent.connections.filter(
          (conn) => !removedEdges.some((edge: any) => edge.id === conn.id)
        );
        onAgentUpdate({ connections: updatedConnections });
      }
    },
    [onEdgesChange, agent.connections, onAgentUpdate]
  );

  const handleFitView = () => {
    reactFlowInstance?.fitView({ padding: 0.2 });
  };

  const handleZoomIn = () => {
    reactFlowInstance?.zoomIn();
  };

  const handleZoomOut = () => {
    reactFlowInstance?.zoomOut();
  };

  return (
    <div className="flow-canvas-wrapper" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        className="flow-canvas"
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
        }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const blockData = node.data as AgentBlock;
            return blockData.color || '#6366f1';
          }}
          className="flow-minimap"
        />

        <Panel position="top-right">
          <div className="flow-controls">
            <button onClick={handleZoomIn} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <button onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button onClick={handleFitView} title="Fit View">
              <Maximize2 size={16} />
            </button>
          </div>
        </Panel>

        {nodes.length === 0 && (
          <Panel position="top-left" className="welcome-panel">
            <div className="welcome-card">
              <h3>Welcome to Agent Builder!</h3>
              <p>
                Start building your trading agent by dragging blocks from the left panel onto the canvas.
              </p>
              <div className="welcome-steps">
                <div className="welcome-step">
                  <span className="step-number">1.</span>
                  <span>Drag a <strong>Trigger</strong> block to start</span>
                </div>
                <div className="welcome-step">
                  <span className="step-number">2.</span>
                  <span>Add <strong>Action</strong> blocks to execute trades</span>
                </div>
                <div className="welcome-step">
                  <span className="step-number">3.</span>
                  <span>Connect blocks by dragging from output to input</span>
                </div>
                <div className="welcome-step">
                  <span className="step-number">4.</span>
                  <span>Configure each block's parameters</span>
                </div>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
