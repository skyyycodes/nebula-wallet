import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AgentBlock } from '../../types/agent-builder';
import * as Icons from 'lucide-react';
import { Settings, Trash2, X, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ExecutionResult } from '../../hooks/useBlockExecutor';

interface BlockNodeData extends AgentBlock {
  onUpdate: (id: string, updates: Partial<AgentBlock>) => void;
  onDelete: (id: string) => void;
  onExecute?: (id: string) => void;
  isExecuting?: boolean;
  isExecutable?: boolean;
  lastResult?: ExecutionResult | null;
}

const AgentBlockNode = memo(({ data, selected }: NodeProps<BlockNodeData>) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const handleExecute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onExecute && !data.isExecuting) {
      data.onExecute(data.id);
    }
  };

  // Get the icon component dynamically
  const IconComponent = (Icons as any)[data.icon || 'Box'] || Icons.Box;

  const handleParameterChange = (paramId: string, value: any) => {
    const updatedParams = (data.parameters || []).map(param =>
      param.id === paramId ? { ...param, value } : param
    );
    data.onUpdate(data.id, { parameters: updatedParams });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onDelete(data.id);
  };

  const getHandleColor = () => {
    return data.color || '#6366f1';
  };

  return (
    <div
      className={`agent-block-node ${selected ? 'selected' : ''} ${!data.isValid ? 'invalid' : ''}`}
      style={{
        borderColor: selected ? data.color : `${data.color}50`,
        borderLeftColor: data.color,
      }}
    >
      {/* Input Handle */}
      {!data.type.startsWith('trigger') && (
        <Handle
          type="target"
          position={Position.Top}
          className="agent-block-handle"
          style={{ background: getHandleColor() }}
        />
      )}

      {/* Block Header */}
      <div
        className="agent-block-header"
        style={{ backgroundColor: `${data.color}15` }}
      >
        <div
          className="agent-block-icon"
          style={{ backgroundColor: data.color }}
        >
          <IconComponent size={14} color="white" />
        </div>
        <div className="agent-block-info">
          <div className="agent-block-label">{data.label}</div>
          <span className="agent-block-type">{data.type}</span>
        </div>
        <div className="agent-block-actions">
          {/* Execute Button - only show for executable blocks */}
          {data.isExecutable && (
            <button
              className={`agent-block-btn execute ${data.isExecuting ? 'executing' : ''} ${data.lastResult?.success ? 'success' : ''} ${data.lastResult && !data.lastResult.success ? 'error' : ''}`}
              onClick={handleExecute}
              disabled={data.isExecuting}
              title={data.isExecuting ? 'Executing...' : 'Execute Block'}
            >
              {data.isExecuting ? (
                <Loader2 size={14} className="spin" />
              ) : data.lastResult?.success ? (
                <CheckCircle2 size={14} />
              ) : data.lastResult && !data.lastResult.success ? (
                <XCircle size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
          )}
          <button
            className="agent-block-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsConfigOpen(!isConfigOpen);
            }}
          >
            <Settings size={14} />
          </button>
          <button
            className="agent-block-btn delete"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Block Body */}
      <div className="agent-block-body">
        <p className="agent-block-description">{data.description}</p>

        {data.parameters && data.parameters.length > 0 && (
          <div className="agent-block-params-preview">
            {data.parameters.slice(0, 2).map((param) => (
              <div key={param.id} className="agent-block-param-row">
                <span className="param-name">{param.name}:</span>
                <span className="param-value">{param.value || '-'}</span>
              </div>
            ))}
            {data.parameters.length > 2 && (
              <p className="agent-block-more">+{data.parameters.length - 2} more</p>
            )}
          </div>
        )}

        {/* Execution Result */}
        {data.lastResult && (
          <div className={`agent-block-result ${data.lastResult.success ? 'success' : 'error'}`}>
            {data.lastResult.success ? (
              <>
                <CheckCircle2 size={12} />
                <span>{data.lastResult.data?.message || 'Success'}</span>
                {data.lastResult.explorerUrl && (
                  <a
                    href={data.lastResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="result-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View TX
                  </a>
                )}
              </>
            ) : (
              <>
                <XCircle size={12} />
                <span>{data.lastResult.error || 'Failed'}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Config Popover */}
      {isConfigOpen && (
        <div className="agent-block-config" onClick={(e) => e.stopPropagation()}>
          <div className="config-header">
            <h4>{data.label}</h4>
            <button onClick={() => setIsConfigOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <p className="config-description">{data.description}</p>

          <div className="config-params">
            {(data.parameters || []).map((param) => (
              <div key={param.id} className="config-param">
                <label>
                  {param.name}
                  {param.required && <span className="required">*</span>}
                </label>

                {param.type === 'select' ? (
                  <select
                    value={param.value}
                    onChange={(e) => handleParameterChange(param.id, e.target.value)}
                  >
                    {param.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : param.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={param.value}
                    onChange={(e) => handleParameterChange(param.id, e.target.checked)}
                  />
                ) : param.type === 'number' || param.type === 'percentage' ? (
                  <input
                    type="number"
                    value={param.value}
                    onChange={(e) => handleParameterChange(param.id, parseFloat(e.target.value) || 0)}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    placeholder={param.placeholder}
                  />
                ) : (
                  <input
                    type="text"
                    value={param.value}
                    onChange={(e) => handleParameterChange(param.id, e.target.value)}
                    placeholder={param.placeholder}
                  />
                )}

                {param.description && (
                  <p className="param-description">{param.description}</p>
                )}
              </div>
            ))}
          </div>

          {data.errors && data.errors.length > 0 && (
            <div className="config-errors">
              <p className="error-title">Errors:</p>
              {data.errors.map((error, i) => (
                <p key={i} className="error-item">• {error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="agent-block-handle"
        style={{ background: getHandleColor() }}
      />

      {/* Condition handles for branching */}
      {data.type === 'condition_compare' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="agent-block-handle condition-true"
            style={{ background: '#10b981', top: '50%' }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="false"
            className="agent-block-handle condition-false"
            style={{ background: '#ef4444', top: '50%' }}
          />
        </>
      )}
    </div>
  );
});

AgentBlockNode.displayName = 'AgentBlockNode';

export default AgentBlockNode;
