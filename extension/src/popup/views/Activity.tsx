import React, { useEffect, useState } from 'react';

interface TransactionActivity {
  id: string;
  type: 'send' | 'receive' | 'payment' | 'swap' | 'payment_request' | 'multi_send';
  origin?: string;
  resource?: string;
  from?: string;
  to?: string;
  amount: string;
  status: 'pending' | 'completed' | 'failed' | 'accepted' | 'rejected' | 'expired';
  txHash?: string;
  timestamp: number;
  error?: string;
  // Multi-send specific
  recipients?: { address: string; amount: string }[];
  memo?: string;
}

export function Activity() {
  const [activities, setActivities] = useState<TransactionActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVITY_LOG' });
      if (response.success && response.data) {
        setActivities(response.data);
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateHeader = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - txDate.getTime()) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const truncateAddress = (address?: string) => {
    if (!address || address.length <= 12) return address || '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const groupByDate = (activities: TransactionActivity[]) => {
    const groups: { [key: string]: TransactionActivity[] } = {};
    activities.forEach(activity => {
      const dateKey = new Date(activity.timestamp).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });
    return groups;
  };

  if (loading) {
    return (
      <div className="content">
        <div className="activity-container">
          <h2 className="activity-title">Recent Activity</h2>
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af' }}>
            <p>Loading transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="content">
        <div className="activity-container">
          <h2 className="activity-title">Recent Activity</h2>
          <div className="empty-state">
            <svg className="empty-icon" viewBox="0 0 120 120" fill="none">
              <circle cx="50" cy="50" r="30" stroke="#666" strokeWidth="3" fill="none" />
              <line x1="72" y1="72" x2="100" y2="100" stroke="#666" strokeWidth="6" strokeLinecap="round" />
              <line x1="35" y1="40" x2="65" y2="40" stroke="#555" strokeWidth="1" />
              <line x1="35" y1="50" x2="65" y2="50" stroke="#555" strokeWidth="1" />
              <line x1="35" y1="60" x2="65" y2="60" stroke="#555" strokeWidth="1" />
            </svg>
            <h3 className="empty-title">No activity yet</h3>
            <p className="empty-description">
              Once you do transactions they will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  const groupedActivities = groupByDate(activities);

  return (
    <div className="content" style={{ padding: 0 }}>
      <div className="activity-container" style={{ padding: 0 }}>
        <div style={{
          padding: '20px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'sticky',
          top: 0,
          background: '#1a1a1a',
          zIndex: 10
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 600,
            margin: 0,
            color: '#fff'
          }}>Recent Activity</h2>
        </div>

        <div style={{ padding: '0' }}>
          {Object.entries(groupedActivities).map(([dateKey, dayActivities]) => (
            <div key={dateKey}>
              <div style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#9ca3af',
                background: 'rgba(0, 0, 0, 0.2)'
              }}>
                {formatDateHeader(dayActivities[0].timestamp)}
              </div>

              {dayActivities.map((activity) => {
                const isReceive = activity.type === 'receive';
                const isSwap = activity.type === 'swap';
                const isMultiSend = activity.type === 'multi_send';
                const isPaymentRequest = activity.type === 'payment_request';

                let label = 'Sent';
                if (isSwap) label = 'Swapped';
                else if (isReceive) label = 'Received';
                else if (isMultiSend) label = 'Multi-Send';
                else if (isPaymentRequest) label = 'Payment Request';

                const address = isReceive ? activity.from : activity.to;
                const prefix = isSwap || isMultiSend ? '' : (isReceive ? 'From' : 'To');
                const recipientCount = activity.recipients?.length || 0;

                return (
                  <div
                    key={activity.id}
                    style={{
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      margin: '8px 16px',
                      borderRadius: '12px',
                      cursor: activity.txHash ? 'pointer' : 'default',
                      transition: 'background 0.2s',
                    }}
                    onClick={() => {
                      if (activity.txHash) {
                        window.open(`https://stellar.expert/explorer/testnet/tx/${activity.txHash}`, '_blank');
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (activity.txHash) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Icon */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        flexShrink: 0
                      }}>
                        {/* Stack icon */}
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            width: '24px',
                            height: '3px',
                            background: '#fff',
                            borderRadius: '2px',
                            marginBottom: '3px'
                          }} />
                          <div style={{
                            width: '24px',
                            height: '3px',
                            background: 'rgba(255, 255, 255, 0.7)',
                            borderRadius: '2px',
                            marginBottom: '3px'
                          }} />
                          <div style={{
                            width: '24px',
                            height: '3px',
                            background: 'rgba(255, 255, 255, 0.5)',
                            borderRadius: '2px'
                          }} />
                        </div>

                        {/* Arrow indicator */}
                        <div style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: isMultiSend ? '#22c55e' : (isSwap ? '#f59e0b' : (isReceive ? '#10b981' : '#6366f1')),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid #1a1a1a'
                        }}>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#fff'
                          }}>
                            {isMultiSend ? '⇉' : (isSwap ? '⇄' : (isReceive ? '↓' : '→'))}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#fff',
                          marginBottom: '2px'
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: '#9ca3af'
                        }}>
                          {isMultiSend
                            ? `To ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`
                            : (isSwap ? 'Token swap' : `${prefix} ${truncateAddress(address || activity.origin)}`)
                          }
                        </div>
                      </div>

                      {/* Amount */}
                      <div style={{
                        fontSize: isSwap ? '12px' : '16px',
                        fontWeight: 600,
                        color: isMultiSend ? '#22c55e' : (isSwap ? '#f59e0b' : (isReceive ? '#10b981' : '#fff')),
                        textAlign: 'right',
                        flexShrink: 0
                      }}>
                        {isSwap ? activity.amount : `${isReceive ? '+' : '-'}${parseFloat(activity.amount).toFixed(5)} XLM`}
                      </div>
                    </div>

                    {activity.error && (
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#ef4444',
                        paddingLeft: '60px'
                      }}>
                        Error: {activity.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
