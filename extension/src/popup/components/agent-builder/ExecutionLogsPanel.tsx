import React, { useState, useEffect } from 'react';
import { ExecutionLog } from '../../types/agent-builder';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ExecutionLogsPanelProps {
  agentId?: string;
  isVisible: boolean;
  onClose: () => void;
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

export default function ExecutionLogsPanel({
  agentId,
  isVisible,
  onClose,
}: ExecutionLogsPanelProps) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const response = await sendMessage('GET_EXECUTION_LOGS', { agentId });
      if (response.success && response.data?.logs) {
        setLogs(response.data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      fetchLogs();
      // Refresh logs every 10 seconds when visible
      const interval = setInterval(fetchLogs, 10000);
      return () => clearInterval(interval);
    }
  }, [isVisible, agentId]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success':
        return <CheckCircle2 size={16} className="text-green" />;
      case 'mock':
        return <CheckCircle2 size={16} className="text-purple" />;
      case 'error':
        return <XCircle size={16} className="text-red" />;
      case 'skipped':
        return <Clock size={16} className="text-yellow" />;
      default:
        return <Activity size={16} />;
    }
  };

  const getResultClass = (result: string) => {
    switch (result) {
      case 'success':
        return 'log-success';
      case 'mock':
        return 'log-mock';
      case 'error':
        return 'log-error';
      case 'skipped':
        return 'log-skipped';
      default:
        return '';
    }
  };

  if (!isVisible) return null;

  return (
    <div className="execution-logs-panel">
      <div className="logs-header">
        <h3>
          <Activity size={18} />
          Execution Logs
        </h3>
        <div className="logs-actions">
          <button
            className="icon-btn"
            onClick={fetchLogs}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? 'spinner' : ''} />
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <XCircle size={16} />
          </button>
        </div>
      </div>

      <div className="logs-content">
        {logs.length === 0 ? (
          <div className="logs-empty">
            <Activity size={24} />
            <p>No execution logs yet</p>
            <span>Logs will appear here when your agent triggers execute</span>
          </div>
        ) : (
          <div className="logs-list">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`log-entry ${getResultClass(log.result)}`}
              >
                <div
                  className="log-summary"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="log-icon">{getResultIcon(log.result)}</div>
                  <div className="log-info">
                    <span className="log-agent">{log.agentName}</span>
                    <span className="log-action">{log.action || log.triggerType}</span>
                  </div>
                  <div className="log-time">{formatTime(log.timestamp)}</div>
                  <div className="log-expand">
                    {expandedLog === log.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </div>

                {expandedLog === log.id && (
                  <div className="log-details">
                    {log.isMock && (
                      <div className="detail-row mock-badge">
                        <span className="mock-indicator">🎭 MOCK EXECUTION</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Trigger:</span>
                      <span className="detail-value">{log.triggerType}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Condition:</span>
                      <span className="detail-value">{log.triggerCondition}</span>
                    </div>
                    {log.priceAtTrigger !== undefined && (
                      <div className="detail-row">
                        <span className="detail-label">Price at trigger:</span>
                        <span className="detail-value">${log.priceAtTrigger.toFixed(6)}</span>
                      </div>
                    )}
                    {log.mockDetails && (
                      <>
                        <div className="detail-row">
                          <span className="detail-label">Simulated:</span>
                          <span className="detail-value">
                            {log.mockDetails.simulatedAmount} {log.mockDetails.simulatedAsset}
                          </span>
                        </div>
                        {log.mockDetails.simulatedDestination && (
                          <div className="detail-row">
                            <span className="detail-label">To:</span>
                            <span className="detail-value">
                              {log.mockDetails.simulatedDestination.slice(0, 16)}...
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {log.txHash && (
                      <div className="detail-row">
                        <span className="detail-label">Transaction:</span>
                        {log.isMock ? (
                          <span className="detail-value mock-tx">{log.txHash}</span>
                        ) : (
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${log.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tx-link"
                          >
                            {log.txHash.slice(0, 16)}...
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}
                    {log.error && (
                      <div className="detail-row error">
                        <span className="detail-label">Error:</span>
                        <span className="detail-value">{log.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
