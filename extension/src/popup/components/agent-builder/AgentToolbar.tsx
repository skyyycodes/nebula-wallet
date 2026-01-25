import React, { useState, useEffect } from 'react';
import { Agent, ExecutionConfig } from '../../types/agent-builder';
import { AgentValidator } from '../../lib/agent-builder/storage';
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Activity,
  MoreVertical,
  Settings,
  Zap,
} from 'lucide-react';

interface AgentToolbarProps {
  agent: Agent;
  onAgentUpdate: (updates: Partial<Agent>) => void;
  onSave: () => void;
  onReset: () => void;
}

interface ExtensionResponse {
  success: boolean;
  data?: any;
  error?: string;
}

async function sendMessage(type: string, payload?: unknown): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

interface AgentToolbarProps {
  agent: Agent;
  onAgentUpdate: (updates: Partial<Agent>) => void;
  onSave: () => void;
  onReset: () => void;
}

export default function AgentToolbar({
  agent,
  onAgentUpdate,
  onSave,
  onReset,
}: AgentToolbarProps) {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<{
    isRunning: boolean;
    lastCheck?: number;
    executionsToday?: number;
  } | null>(null);

  // Default execution config
  const defaultConfig: ExecutionConfig = {
    pollInterval: 30000,
    autoExecute: true,
    notifyOnTrigger: true,
    dailyLimit: 10,
    maxSlippage: 3,
    useMockExecution: false,
    useMainnetPrices: true,
  };

  const [editConfig, setEditConfig] = useState<ExecutionConfig>(
    agent.executionConfig || defaultConfig
  );

  // Check runner status periodically
  useEffect(() => {
    const checkStatus = async () => {
      const response = await sendMessage('GET_AGENT_RUNNER_STATUS', { agentId: agent.id });
      if (response.success && response.data) {
        setRunnerStatus(response.data);
        // Sync UI state with actual runner state
        if (response.data.isRunning !== agent.isActive) {
          onAgentUpdate({
            isActive: response.data.isRunning,
            status: response.data.isRunning ? 'active' : 'paused',
          });
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [agent.id]);

  const handleToggleActive = async () => {
    setIsStarting(true);

    try {
      if (!agent.isActive) {
        // Validate before activating
        const validation = AgentValidator.validate(agent);
        if (!validation.isValid) {
          alert('Cannot activate agent: ' + validation.errors[0]);
          setIsStarting(false);
          return;
        }

        // Start agent in background
        const response = await sendMessage('START_AGENT', {
          ...agent,
          executionConfig: agent.executionConfig || defaultConfig,
        });

        if (!response.success) {
          alert('Failed to start agent: ' + response.error);
          setIsStarting(false);
          return;
        }

        onAgentUpdate({
          isActive: true,
          status: 'active',
        });
      } else {
        // Stop agent
        const response = await sendMessage('STOP_AGENT', { agentId: agent.id });

        if (!response.success) {
          alert('Failed to stop agent: ' + response.error);
          setIsStarting(false);
          return;
        }

        onAgentUpdate({
          isActive: false,
          status: 'paused',
        });
      }
    } catch (error) {
      console.error('Error toggling agent:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsStarting(false);
    }
  };

  const handleValidate = () => {
    setIsValidating(true);

    setTimeout(() => {
      const validation = AgentValidator.validate(agent);

      if (validation.isValid) {
        alert('Validation passed! Your agent is ready to run.');
      } else {
        alert('Validation failed: ' + validation.errors.join(', '));
      }

      if (validation.warnings.length > 0) {
        console.warn('Warnings:', validation.warnings);
      }

      setIsValidating(false);
    }, 500);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(agent, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${agent.name.replace(/\s+/g, '_')}_agent.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          // Basic validation
          if (imported.blocks && imported.connections) {
            onAgentUpdate({
              blocks: imported.blocks,
              connections: imported.connections,
            });
            alert('Agent imported successfully');
          } else {
            alert('Invalid agent file');
          }
        } catch (error) {
          alert('Failed to import agent');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    setShowResetDialog(false);
    onReset();
  };

  const validation = AgentValidator.validate(agent);

  return (
    <>
      <div className="agent-toolbar">
        {/* Agent Info */}
        <div className="toolbar-left">
          <input
            type="text"
            value={agent.name}
            onChange={(e) => onAgentUpdate({ name: e.target.value })}
            className="agent-name-input"
            placeholder="Agent name"
          />

          <div className="toolbar-badges">
            <span className={`badge ${agent.isActive ? 'active' : 'inactive'}`}>
              {agent.isActive ? <Zap size={12} /> : <Activity size={12} />}
              {agent.status}
              {runnerStatus?.isRunning && runnerStatus.executionsToday !== undefined && (
                <span className="badge-count">({runnerStatus.executionsToday} today)</span>
              )}
            </span>

            {validation.isValid ? (
              <span className="badge valid">
                <CheckCircle2 size={12} />
                Valid
              </span>
            ) : (
              <span className="badge invalid">
                <AlertCircle size={12} />
                {validation.errors.length} error(s)
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="toolbar-right">
          <button
            className={`toolbar-btn ${agent.isActive ? 'danger' : 'primary'}`}
            onClick={handleToggleActive}
            disabled={isStarting}
          >
            {isStarting ? (
              <>
                <Activity size={16} className="spinner" />
                {agent.isActive ? 'Stopping...' : 'Starting...'}
              </>
            ) : agent.isActive ? (
              <>
                <Pause size={16} />
                Pause
              </>
            ) : (
              <>
                <Play size={16} />
                Activate
              </>
            )}
          </button>

          <button
            className="toolbar-btn"
            onClick={() => setShowConfigDialog(true)}
            title="Execution Settings"
          >
            <Settings size={16} />
          </button>

          <button
            className="toolbar-btn"
            onClick={handleValidate}
            disabled={isValidating}
          >
            <CheckCircle2 size={16} />
            Validate
          </button>

          <button className="toolbar-btn" onClick={onSave}>
            <Save size={16} />
            Save
          </button>

          <div className="toolbar-menu">
            <button
              className="toolbar-btn icon-only"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div className="toolbar-dropdown">
                <button onClick={() => { handleExport(); setShowMenu(false); }}>
                  <Download size={14} />
                  Export Agent
                </button>
                <button onClick={() => { handleImport(); setShowMenu(false); }}>
                  <Upload size={14} />
                  Import Agent
                </button>
                <div className="dropdown-divider" />
                <button
                  className="danger"
                  onClick={() => { setShowResetDialog(true); setShowMenu(false); }}
                >
                  <RotateCcw size={14} />
                  Reset Agent
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reset Dialog */}
      {showResetDialog && (
        <div className="modal-overlay" onClick={() => setShowResetDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Agent?</h3>
            <p>
              This will remove all blocks and connections. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowResetDialog(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Config Dialog */}
      {showConfigDialog && (
        <div className="modal-overlay" onClick={() => setShowConfigDialog(false)}>
          <div className="modal-content config-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Settings size={18} />
              Execution Settings
            </h3>
            
            <div className="config-form">
              <div className="config-field">
                <label>Poll Interval</label>
                <select
                  value={editConfig.pollInterval}
                  onChange={(e) => setEditConfig({ ...editConfig, pollInterval: parseInt(e.target.value) })}
                >
                  <option value={10000}>10 seconds</option>
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                </select>
                <span className="field-hint">How often to check trigger conditions</span>
              </div>

              <div className="config-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editConfig.autoExecute}
                    onChange={(e) => setEditConfig({ ...editConfig, autoExecute: e.target.checked })}
                  />
                  Auto-Execute Actions
                </label>
                <span className="field-hint">Automatically execute when triggers fire (vs notify only)</span>
              </div>

              <div className="config-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editConfig.notifyOnTrigger}
                    onChange={(e) => setEditConfig({ ...editConfig, notifyOnTrigger: e.target.checked })}
                  />
                  Show Notifications
                </label>
                <span className="field-hint">Show browser notification when triggers fire</span>
              </div>

              <div className="config-field">
                <label>Daily Execution Limit</label>
                <input
                  type="number"
                  value={editConfig.dailyLimit}
                  onChange={(e) => setEditConfig({ ...editConfig, dailyLimit: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={100}
                />
                <span className="field-hint">Maximum executions per day (0 = unlimited)</span>
              </div>

              <div className="config-field">
                <label>Max Slippage %</label>
                <input
                  type="number"
                  value={editConfig.maxSlippage}
                  onChange={(e) => setEditConfig({ ...editConfig, maxSlippage: parseFloat(e.target.value) || 1 })}
                  min={0.1}
                  max={10}
                  step={0.1}
                />
                <span className="field-hint">Maximum slippage allowed for swaps</span>
              </div>

              <div className="config-divider">
                <span>Execution Mode</span>
              </div>

              <div className="config-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editConfig.useMockExecution ?? false}
                    onChange={(e) => setEditConfig({ ...editConfig, useMockExecution: e.target.checked })}
                  />
                  Mock Execution Mode
                </label>
                <span className="field-hint">Simulate transactions without real funds (for demos)</span>
              </div>

              <div className="config-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editConfig.useMainnetPrices ?? true}
                    onChange={(e) => setEditConfig({ ...editConfig, useMainnetPrices: e.target.checked })}
                  />
                  Use Mainnet Prices
                </label>
                <span className="field-hint">Use CoinGecko mainnet prices for triggers (recommended)</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => {
                setEditConfig(agent.executionConfig || defaultConfig);
                setShowConfigDialog(false);
              }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => {
                onAgentUpdate({ executionConfig: editConfig });
                setShowConfigDialog(false);
                // Update running agent config if active
                if (agent.isActive) {
                  sendMessage('UPDATE_AGENT_RUNNER_CONFIG', {
                    agentId: agent.id,
                    config: editConfig,
                  });
                }
              }}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
