import React, { useState } from 'react';
import { useSpending } from '../hooks/useSpending';
import type { ServicePolicy } from '../../types';

type TabType = 'account' | 'services' | 'activity' | 'agent';

export const Spending: React.FC = () => {
  const {
    spendingAccount,
    balance,
    services,
    activity,
    agentStatus,
    agentConfig,
    loading,
    error,
    createSpendingAccount,
    fundSpendingAccount,
    refreshBalance,
    updateServicePolicy,
    deleteService,
    updateAgentConfig
  } = useSpending();

  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [actionLoading, setActionLoading] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);

  const handleCreateAccount = async () => {
    setActionLoading(true);
    await createSpendingAccount();
    setActionLoading(false);
  };

  const handleFundAccount = async () => {
    setActionLoading(true);
    await fundSpendingAccount();
    setActionLoading(false);
  };

  const handleRefreshBalance = async () => {
    setActionLoading(true);
    await refreshBalance();
    setActionLoading(false);
  };

  const handleToggleAgent = async () => {
    await updateAgentConfig({ enabled: !agentConfig?.enabled });
  };

  const renderAccountTab = () => (
    <div className="spending-section">
      <h3>Spending Account</h3>
      <p className="section-desc">
        Separate Ed25519 account for fast X402 micropayments
      </p>
      
      {!spendingAccount?.exists ? (
        <div className="empty-state">
          <p>No spending account created yet</p>
          <button 
            className="btn-primary"
            onClick={handleCreateAccount}
            disabled={actionLoading}
          >
            {actionLoading ? 'Creating...' : 'Create Spending Account'}
          </button>
        </div>
      ) : (
        <div className="account-info">
          <div className="balance-display">
            <span className="balance-amount">{parseFloat(balance).toFixed(4)}</span>
            <span className="balance-unit">XLM</span>
          </div>
          
          <div className="address-box">
            <label>Address</label>
            <code>{spendingAccount.address}</code>
          </div>

          <div className="action-buttons">
            <button 
              className="btn-secondary"
              onClick={handleRefreshBalance}
              disabled={actionLoading}
            >
              Refresh
            </button>
            <button 
              className="btn-primary"
              onClick={handleFundAccount}
              disabled={actionLoading}
            >
              {actionLoading ? 'Funding...' : 'Fund with Friendbot'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderServicesTab = () => (
    <div className="spending-section">
      <h3>Service Policies</h3>
      <p className="section-desc">
        Configure payment permissions for each service
      </p>
      
      {services.length === 0 ? (
        <div className="empty-state">
          <p>No services configured yet</p>
          <p className="hint">Services will appear after your first X402 payment</p>
        </div>
      ) : (
        <div className="services-list">
          {services.map(service => (
            <div key={service.origin} className="service-card">
              <div className="service-header">
                <span className="service-name">{service.name}</span>
                <span className={`permission-badge ${service.permission}`}>
                  {service.permission}
                </span>
              </div>
              
              <div className="service-stats">
                <span>Today: {parseFloat(service.spentToday).toFixed(2)} XLM</span>
                <span>Limit: {service.maxPerDay} XLM/day</span>
              </div>

              {editingService === service.origin ? (
                <div className="service-edit">
                  <select
                    value={service.permission}
                    onChange={(e) => {
                      updateServicePolicy({
                        ...service,
                        permission: e.target.value as 'auto' | 'prompt' | 'deny'
                      });
                    }}
                  >
                    <option value="auto">Auto-approve</option>
                    <option value="prompt">Prompt each time</option>
                    <option value="deny">Block</option>
                  </select>
                  <button onClick={() => setEditingService(null)}>Done</button>
                </div>
              ) : (
                <div className="service-actions">
                  <button onClick={() => setEditingService(service.origin)}>Edit</button>
                  <button 
                    className="btn-danger"
                    onClick={() => deleteService(service.origin)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderActivityTab = () => (
    <div className="spending-section">
      <h3>Payment History</h3>
      
      {activity.length === 0 ? (
        <div className="empty-state">
          <p>No payment activity yet</p>
        </div>
      ) : (
        <div className="activity-list">
          {activity.slice(0, 20).map(tx => (
            <div key={tx.id} className={`activity-item ${tx.status}`}>
              <div className="activity-main">
                <span className="activity-origin">{tx.origin ? new URL(tx.origin).hostname : 'Unknown'}</span>
                <span className="activity-amount">-{parseFloat(tx.amount).toFixed(4)} XLM</span>
              </div>
              <div className="activity-details">
                <span className="activity-resource">{tx.resource ? tx.resource.slice(0, 40) + '...' : 'N/A'}</span>
                <span className="activity-time">
                  {new Date(tx.timestamp).toLocaleString()}
                </span>
              </div>
              <div className={`activity-status ${tx.status}`}>
                {tx.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAgentTab = () => (
    <div className="spending-section">
      <h3>Auto-Recharge Agent</h3>
      <p className="section-desc">
        Automatically monitor balance and notify for recharges
      </p>
      
      <div className="agent-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={agentConfig?.enabled || false}
            onChange={handleToggleAgent}
          />
          <span className="slider"></span>
        </label>
        <span>{agentConfig?.enabled ? 'Agent Active' : 'Agent Disabled'}</span>
      </div>

      {agentStatus && (
        <div className="agent-stats">
          <div className="stat-row">
            <span>Spending Balance</span>
            <span>{parseFloat(agentStatus.spendingBalance).toFixed(4)} XLM</span>
          </div>
          <div className="stat-row">
            <span>Recharge Threshold</span>
            <span>{agentConfig?.rechargeThreshold || '5'} XLM</span>
          </div>
          <div className="stat-row">
            <span>Recharge Amount</span>
            <span>{agentConfig?.rechargeAmount || '10'} XLM</span>
          </div>
          <div className="stat-row">
            <span>Recharges Today</span>
            <span>{agentStatus.rechargesToday}</span>
          </div>
          {agentStatus.nextCheck && agentStatus.nextCheck > 0 && (
            <div className="stat-row">
              <span>Next Check</span>
              <span>{new Date(agentStatus.nextCheck).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      )}

      <div className="agent-config">
        <h4>Settings</h4>
        <div className="config-row">
          <label>Recharge when below</label>
          <input
            type="number"
            value={agentConfig?.rechargeThreshold || '5'}
            onChange={(e) => updateAgentConfig({ rechargeThreshold: e.target.value })}
          />
          <span>XLM</span>
        </div>
        <div className="config-row">
          <label>Recharge amount</label>
          <input
            type="number"
            value={agentConfig?.rechargeAmount || '10'}
            onChange={(e) => updateAgentConfig({ rechargeAmount: e.target.value })}
          />
          <span>XLM</span>
        </div>
        <div className="config-row">
          <label>Daily limit</label>
          <input
            type="number"
            value={agentConfig?.maxRechargePerDay || '50'}
            onChange={(e) => updateAgentConfig({ maxRechargePerDay: e.target.value })}
          />
          <span>XLM</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <div className="spending-loading">Loading...</div>;
  }

  if (error) {
    return <div className="spending-error">{error}</div>;
  }

  return (
    <div className="spending-container">
      <div className="spending-tabs">
        <button
          className={activeTab === 'account' ? 'active' : ''}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
        <button
          className={activeTab === 'services' ? 'active' : ''}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
        <button
          className={activeTab === 'agent' ? 'active' : ''}
          onClick={() => setActiveTab('agent')}
        >
          Agent
        </button>
      </div>

      <div className="spending-content">
        {activeTab === 'account' && renderAccountTab()}
        {activeTab === 'services' && renderServicesTab()}
        {activeTab === 'activity' && renderActivityTab()}
        {activeTab === 'agent' && renderAgentTab()}
      </div>
    </div>
  );
};
