import React, { useState, useEffect, useCallback } from 'react';
import { TradingChart } from '../components/TradingChart';

interface PriceData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: number;
}

interface PriceAlert {
  id: string;
  pair: string;
  targetPrice: number;
  condition: 'above' | 'below';
  enabled: boolean;
  createdAt: number;
  triggered?: boolean;
}

const STORAGE_KEY = 'xlm_price_alerts';

export function Indicator() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [newAlertCondition, setNewAlertCondition] = useState<'above' | 'below'>('above');
  const [activeTab, setActiveTab] = useState<'chart' | 'alerts'>('chart');

  // Fetch real-time XLM price from CoinGecko
  const fetchPrice = useCallback(async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/stellar?localization=false&tickers=false&community_data=false&developer_data=false'
      );
      const data = await response.json();

      const newPriceData: PriceData = {
        price: data.market_data.current_price.usd,
        change24h: data.market_data.price_change_percentage_24h,
        high24h: data.market_data.high_24h.usd,
        low24h: data.market_data.low_24h.usd,
        volume24h: data.market_data.total_volume.usd,
        marketCap: data.market_data.market_cap.usd,
        lastUpdated: Date.now(),
      };

      setPriceData(newPriceData);
      setLoading(false);

      // Check alerts
      checkAlerts(newPriceData.price);
    } catch (error) {
      console.error('Failed to fetch price:', error);
      setLoading(false);
    }
  }, []);

  // Load alerts from storage
  const loadAlerts = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        setAlerts(result[STORAGE_KEY]);
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  }, []);

  // Save alerts to storage
  const saveAlerts = async (newAlerts: PriceAlert[]) => {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: newAlerts });
      setAlerts(newAlerts);
    } catch (error) {
      console.error('Failed to save alerts:', error);
    }
  };

  // Check if any alerts should be triggered
  const checkAlerts = (currentPrice: number) => {
    setAlerts((prevAlerts) => {
      let hasTriggered = false;
      const updatedAlerts = prevAlerts.map((alert) => {
        if (!alert.enabled || alert.triggered) return alert;

        const shouldTrigger =
          (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
          (alert.condition === 'below' && currentPrice <= alert.targetPrice);

        if (shouldTrigger) {
          hasTriggered = true;
          // Show notification
          if (Notification.permission === 'granted') {
            new Notification('XLM Price Alert', {
              body: `XLM is now ${alert.condition} $${alert.targetPrice.toFixed(4)} (Current: $${currentPrice.toFixed(4)})`,
              icon: 'icons/nebula_purple.png',
            });
          }
          return { ...alert, triggered: true, enabled: false };
        }
        return alert;
      });

      if (hasTriggered) {
        chrome.storage.local.set({ [STORAGE_KEY]: updatedAlerts });
      }
      return updatedAlerts;
    });
  };

  // Add new alert
  const handleAddAlert = () => {
    const price = parseFloat(newAlertPrice);
    if (isNaN(price) || price <= 0) return;

    const newAlert: PriceAlert = {
      id: crypto.randomUUID(),
      pair: 'XLM/USD',
      targetPrice: price,
      condition: newAlertCondition,
      enabled: true,
      createdAt: Date.now(),
    };

    saveAlerts([...alerts, newAlert]);
    setNewAlertPrice('');
    setShowAlertModal(false);
  };

  // Delete alert
  const handleDeleteAlert = (id: string) => {
    saveAlerts(alerts.filter((a) => a.id !== id));
  };

  // Toggle alert
  const handleToggleAlert = (id: string) => {
    saveAlerts(
      alerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled, triggered: false } : a
      )
    );
  };

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    fetchPrice();
    loadAlerts();
    requestNotificationPermission();

    // Poll every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [fetchPrice, loadAlerts]);

  const formatNumber = (num: number, decimals = 2) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  const formatPrice = (price: number) => {
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.pairIcon}>
            <span style={styles.xlmIcon}>XLM</span>
          </div>
          <div style={styles.pairInfo}>
            <h1 style={styles.pairName}>XLM / USD</h1>
            <span style={styles.network}>Stellar Network</span>
          </div>
        </div>
        {priceData && (
          <div style={styles.priceDisplay}>
            <span style={styles.currentPrice}>${formatPrice(priceData.price)}</span>
            <span
              style={{
                ...styles.priceChange,
                color: priceData.change24h >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {priceData.change24h >= 0 ? '+' : ''}
              {priceData.change24h.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {priceData && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>24h High</span>
            <span style={{ ...styles.statValue, color: '#22c55e' }}>
              ${formatPrice(priceData.high24h)}
            </span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>24h Low</span>
            <span style={{ ...styles.statValue, color: '#ef4444' }}>
              ${formatPrice(priceData.low24h)}
            </span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>24h Volume</span>
            <span style={styles.statValue}>{formatNumber(priceData.volume24h)}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Market Cap</span>
            <span style={styles.statValue}>{formatNumber(priceData.marketCap)}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'chart' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('chart')}
        >
          Chart
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'alerts' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('alerts')}
        >
          Alerts ({alerts.filter((a) => a.enabled).length})
        </button>
      </div>

      {/* Content */}
      {activeTab === 'chart' ? (
        <div style={styles.chartWrapper}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading chart...</p>
            </div>
          ) : (
            <TradingChart
              initialPair={{ base: 'XLM', quote: 'USDC' }}
              height={280}
            />
          )}
        </div>
      ) : (
        <div style={styles.alertsContainer}>
          {/* Add Alert Button */}
          <button style={styles.addAlertBtn} onClick={() => setShowAlertModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Add Price Alert
          </button>

          {/* Alerts List */}
          {alerts.length === 0 ? (
            <div style={styles.emptyAlerts}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4a4a4a" strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <p style={styles.emptyText}>No price alerts set</p>
              <p style={styles.emptySubtext}>Get notified when XLM hits your target price</p>
            </div>
          ) : (
            <div style={styles.alertsList}>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    ...styles.alertItem,
                    opacity: alert.enabled ? 1 : 0.5,
                  }}
                >
                  <div style={styles.alertInfo}>
                    <div style={styles.alertCondition}>
                      <span
                        style={{
                          ...styles.alertBadge,
                          background: alert.condition === 'above' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: alert.condition === 'above' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {alert.condition === 'above' ? '↑' : '↓'} {alert.condition}
                      </span>
                      <span style={styles.alertPrice}>${alert.targetPrice.toFixed(4)}</span>
                    </div>
                    <span style={styles.alertPair}>{alert.pair}</span>
                    {alert.triggered && (
                      <span style={styles.triggeredBadge}>Triggered</span>
                    )}
                  </div>
                  <div style={styles.alertActions}>
                    <button
                      style={styles.alertToggle}
                      onClick={() => handleToggleAlert(alert.id)}
                    >
                      <div
                        style={{
                          ...styles.toggleTrack,
                          background: alert.enabled ? '#a855f7' : '#3a3a3a',
                        }}
                      >
                        <div
                          style={{
                            ...styles.toggleThumb,
                            transform: alert.enabled ? 'translateX(16px)' : 'translateX(0)',
                          }}
                        />
                      </div>
                    </button>
                    <button
                      style={styles.deleteBtn}
                      onClick={() => handleDeleteAlert(alert.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last Updated */}
      {priceData && (
        <div style={styles.lastUpdated}>
          Last updated: {new Date(priceData.lastUpdated).toLocaleTimeString()}
        </div>
      )}

      {/* Add Alert Modal */}
      {showAlertModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAlertModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Set Price Alert</h3>

            <div style={styles.modalField}>
              <label style={styles.modalLabel}>Alert when price goes</label>
              <div style={styles.conditionBtns}>
                <button
                  style={{
                    ...styles.conditionBtn,
                    ...(newAlertCondition === 'above' ? styles.conditionBtnActive : {}),
                    ...(newAlertCondition === 'above' ? { borderColor: '#22c55e', color: '#22c55e' } : {}),
                  }}
                  onClick={() => setNewAlertCondition('above')}
                >
                  Above
                </button>
                <button
                  style={{
                    ...styles.conditionBtn,
                    ...(newAlertCondition === 'below' ? styles.conditionBtnActive : {}),
                    ...(newAlertCondition === 'below' ? { borderColor: '#ef4444', color: '#ef4444' } : {}),
                  }}
                  onClick={() => setNewAlertCondition('below')}
                >
                  Below
                </button>
              </div>
            </div>

            <div style={styles.modalField}>
              <label style={styles.modalLabel}>Target Price (USD)</label>
              <input
                type="number"
                step="0.0001"
                value={newAlertPrice}
                onChange={(e) => setNewAlertPrice(e.target.value)}
                placeholder={priceData ? formatPrice(priceData.price) : '0.1234'}
                style={styles.modalInput}
              />
              {priceData && (
                <span style={styles.currentPriceHint}>
                  Current: ${formatPrice(priceData.price)}
                </span>
              )}
            </div>

            <div style={styles.modalActions}>
              <button style={styles.modalCancel} onClick={() => setShowAlertModal(false)}>
                Cancel
              </button>
              <button style={styles.modalConfirm} onClick={handleAddAlert}>
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '16px',
    height: '100%',
    overflowY: 'auto',
    background: '#0f0f0f',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pairIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #08B5E5 0%, #0891b2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xlmIcon: {
    color: 'white',
    fontSize: '12px',
    fontWeight: 700,
  },
  pairInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  pairName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#e5e5e5',
    margin: 0,
  },
  network: {
    fontSize: '11px',
    color: '#6b7280',
  },
  priceDisplay: {
    textAlign: 'right',
  },
  currentPrice: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#e5e5e5',
    display: 'block',
  },
  priceChange: {
    fontSize: '13px',
    fontWeight: 500,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '16px',
  },
  statCard: {
    background: '#1a1a1a',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#6b7280',
  },
  statValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e5e5e5',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    background: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    color: '#9ca3af',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabActive: {
    background: '#a855f7',
    color: 'white',
  },
  chartWrapper: {
    background: '#1a1a1a',
    borderRadius: '12px',
    padding: '8px',
    minHeight: '300px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '280px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #2a2a2a',
    borderTopColor: '#a855f7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: '13px',
    marginTop: '12px',
  },
  alertsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  addAlertBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    background: '#a855f7',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  emptyAlerts: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: '14px',
    marginTop: '16px',
    marginBottom: '4px',
  },
  emptySubtext: {
    color: '#6b7280',
    fontSize: '12px',
  },
  alertsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  alertItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#1a1a1a',
    borderRadius: '8px',
    padding: '12px',
  },
  alertInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  alertCondition: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  alertBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'capitalize',
  },
  alertPrice: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#e5e5e5',
  },
  alertPair: {
    fontSize: '11px',
    color: '#6b7280',
  },
  triggeredBadge: {
    fontSize: '10px',
    color: '#f59e0b',
    fontWeight: 500,
  },
  alertActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  alertToggle: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
  toggleTrack: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    position: 'relative',
    transition: 'background 0.2s',
  },
  toggleThumb: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: 'white',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'transform 0.2s',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px',
  },
  lastUpdated: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#4b5563',
    marginTop: '16px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1a1a',
    borderRadius: '16px',
    padding: '20px',
    width: '90%',
    maxWidth: '320px',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#e5e5e5',
    marginTop: 0,
    marginBottom: '16px',
  },
  modalField: {
    marginBottom: '16px',
  },
  modalLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '8px',
  },
  conditionBtns: {
    display: 'flex',
    gap: '8px',
  },
  conditionBtn: {
    flex: 1,
    padding: '10px',
    background: '#252525',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#9ca3af',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  conditionBtnActive: {
    background: 'rgba(168, 85, 247, 0.1)',
  },
  modalInput: {
    width: '100%',
    padding: '12px',
    background: '#252525',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#e5e5e5',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  currentPriceHint: {
    display: 'block',
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '4px',
  },
  modalActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '20px',
  },
  modalCancel: {
    flex: 1,
    padding: '12px',
    background: '#252525',
    border: 'none',
    borderRadius: '8px',
    color: '#9ca3af',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  modalConfirm: {
    flex: 1,
    padding: '12px',
    background: '#a855f7',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
