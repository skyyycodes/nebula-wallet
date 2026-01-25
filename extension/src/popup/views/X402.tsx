import React, { useState } from 'react';
import { useSpending } from '../hooks/useSpending';
import { useWallet } from '../hooks/useWallet';

type DemoState = 'idle' | 'calling' | 'payment_required' | 'paying' | 'success' | 'error';

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
  description: string;
}

function sendMessage(type: string, payload?: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

export function X402() {
  const {
    spendingAccount,
    balance: spendingBalance,
    loading: spendingLoading,
    createSpendingAccount,
    fundSpendingAccount,
    refreshBalance: refreshSpendingBalance
  } = useSpending();

  const {
    currentAccount: mainWallet,
    balance: mainWalletBalance,
    isLoading: walletLoading,
    refreshBalance: refreshMainBalance
  } = useWallet();

  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [requirements, setRequirements] = useState<PaymentRequirements | null>(null);
  const [premiumContent, setPremiumContent] = useState<any>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleCallApi = async () => {
    if (!spendingAccount?.address) {
      setError('No spending account. Create one first.');
      return;
    }
    if (!mainWallet?.address) {
      setError('No main wallet connected.');
      return;
    }

    setDemoState('calling');
    setError(null);
    setPremiumContent(null);
    setTxHash(null);

    // Simulate API call delay
    await new Promise(r => setTimeout(r, 800));

    // Simulate 402 Payment Required response
    // Pay from spending account TO the main wallet
    const demoRequirements: PaymentRequirements = {
      scheme: 'exact',
      network: 'stellar-testnet',
      maxAmountRequired: '1000000', // 0.1 XLM in stroops
      resource: 'demo://api/premium-data',
      payTo: mainWallet.address, // Pay to main wallet!
      asset: 'native',
      description: 'Premium API Access - Weather Forecast Data'
    };

    setRequirements(demoRequirements);
    setDemoState('payment_required');
  };

  const handlePayAndRetry = async () => {
    if (!requirements) return;

    setDemoState('paying');
    setError(null);

    try {
      // Send payment via background script
      const result = await sendMessage('X402_SIGN_PAYMENT', {
        origin: 'chrome-extension://x402-demo',
        requirements,
        forceApprove: true
      });

      if (result.success) {
        setTxHash(result.txHash);

        // Simulate receiving premium content after payment
        const mockContent = {
          status: 'success',
          data: {
            forecast: 'Sunny with clouds',
            temperature: '24°C',
            humidity: '45%',
            wind: '12 km/h NW',
            premium_insights: [
              'High UV index expected at noon',
              'Best time for outdoor activities: 4-6 PM',
              'Rain probability next 48h: 15%'
            ]
          },
          access_granted_at: new Date().toISOString()
        };

        setPremiumContent(mockContent);
        setDemoState('success');

        // Refresh both balances to show the transfer
        await Promise.all([
          refreshSpendingBalance(),
          refreshMainBalance()
        ]);
      } else {
        setError(result.error || 'Payment failed');
        setDemoState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      setDemoState('error');
    }
  };

  const handleReset = () => {
    setDemoState('idle');
    setRequirements(null);
    setPremiumContent(null);
    setTxHash(null);
    setError(null);
  };

  const stroopsToXLM = (stroops: string) => {
    return (parseInt(stroops) / 10000000).toFixed(2);
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  };

  const loading = spendingLoading || walletLoading;

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>402</div>
        <h1 style={styles.title}>X402 Demo</h1>
        <p style={styles.subtitle}>HTTP 402 Payment Required - Monetize APIs with Stellar</p>
      </div>

      {/* Accounts Section */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Accounts</h3>

        {/* Spending Account (Sender) */}
        <div style={styles.accountBox}>
          <div style={styles.accountHeader}>
            <span style={styles.accountLabel}>Spending Account</span>
            <span style={styles.accountRole}>(Payer)</span>
          </div>
          {!spendingAccount?.exists ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No spending account yet</p>
              <button
                style={styles.btnPrimary}
                onClick={handleCreateAccount}
                disabled={actionLoading}
              >
                {actionLoading ? 'Creating...' : 'Create Spending Account'}
              </button>
            </div>
          ) : (
            <div style={styles.accountInfo}>
              <div style={styles.balanceRow}>
                <span style={styles.balanceLabel}>Balance</span>
                <span style={styles.balanceValue}>{parseFloat(spendingBalance).toFixed(4)} XLM</span>
              </div>
              <div style={styles.addressRow}>
                <span style={styles.addressLabel}>Address</span>
                <code style={styles.addressCode}>{truncateAddress(spendingAccount.address || '')}</code>
              </div>
              <button
                style={styles.btnSecondary}
                onClick={handleFundAccount}
                disabled={actionLoading}
              >
                {actionLoading ? 'Funding...' : 'Fund with Friendbot'}
              </button>
            </div>
          )}
        </div>

        {/* Main Wallet (Receiver) */}
        <div style={{ ...styles.accountBox, marginTop: '12px' }}>
          <div style={styles.accountHeader}>
            <span style={styles.accountLabel}>Main Wallet</span>
            <span style={{ ...styles.accountRole, color: '#22c55e' }}>(Receiver)</span>
          </div>
          {!mainWallet?.address ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No wallet connected</p>
            </div>
          ) : (
            <div style={styles.accountInfo}>
              <div style={styles.balanceRow}>
                <span style={styles.balanceLabel}>Balance</span>
                <span style={{ ...styles.balanceValue, color: '#22c55e' }}>{parseFloat(mainWalletBalance).toFixed(4)} XLM</span>
              </div>
              <div style={styles.addressRow}>
                <span style={styles.addressLabel}>Address</span>
                <code style={{ ...styles.addressCode, color: '#22c55e' }}>{truncateAddress(mainWallet.address)}</code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Demo Section */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Demo: Monetized API</h3>

        {demoState === 'idle' && (
          <div style={styles.demoSection}>
            <p style={styles.demoText}>
              Click below to call a premium API endpoint. It will return a 402 Payment Required response,
              then you can pay with your spending account to access the content.
            </p>
            <button
              style={styles.btnPrimary}
              onClick={handleCallApi}
              disabled={!spendingAccount?.exists || !mainWallet?.address || parseFloat(spendingBalance) < 0.1}
            >
              Call Premium API
            </button>
            {parseFloat(spendingBalance) < 0.1 && spendingAccount?.exists && (
              <p style={styles.warningText}>Need at least 0.1 XLM in spending account</p>
            )}
            {!mainWallet?.address && (
              <p style={styles.warningText}>Need a main wallet to receive payment</p>
            )}
          </div>
        )}

        {demoState === 'calling' && (
          <div style={styles.statusSection}>
            <div style={styles.spinner}></div>
            <p style={styles.statusText}>Calling API...</p>
          </div>
        )}

        {demoState === 'payment_required' && requirements && (
          <div style={styles.paymentRequired}>
            <div style={styles.errorBadge}>402 Payment Required</div>
            <div style={styles.requirementsList}>
              <div style={styles.reqRow}>
                <span style={styles.reqLabel}>Amount</span>
                <span style={styles.reqValue}>{stroopsToXLM(requirements.maxAmountRequired)} XLM</span>
              </div>
              <div style={styles.reqRow}>
                <span style={styles.reqLabel}>Resource</span>
                <span style={styles.reqValue}>{requirements.resource}</span>
              </div>
              <div style={styles.reqRow}>
                <span style={styles.reqLabel}>Description</span>
                <span style={styles.reqValue}>{requirements.description}</span>
              </div>
            </div>
            <p style={styles.noteText}>
              Spending account pays → Main wallet receives
            </p>
            <div style={styles.buttonRow}>
              <button style={styles.btnSecondary} onClick={handleReset}>
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={handlePayAndRetry}>
                Pay & Access
              </button>
            </div>
          </div>
        )}

        {demoState === 'paying' && (
          <div style={styles.statusSection}>
            <div style={styles.spinner}></div>
            <p style={styles.statusText}>Processing payment...</p>
          </div>
        )}

        {demoState === 'success' && premiumContent && (
          <div style={styles.successSection}>
            <div style={styles.successBadge}>Payment Successful</div>

            {txHash && (
              <div style={styles.txRow}>
                <span style={styles.txLabel}>TX Hash</span>
                <code style={styles.txCode}>{truncateAddress(txHash)}</code>
              </div>
            )}

            <div style={styles.contentBox}>
              <h4 style={styles.contentTitle}>Premium Content Received:</h4>
              <pre style={styles.contentPre}>
                {JSON.stringify(premiumContent.data, null, 2)}
              </pre>
            </div>

            <button style={styles.btnPrimary} onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}

        {demoState === 'error' && (
          <div style={styles.errorSection}>
            <div style={styles.errorBadge}>Error</div>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.btnSecondary} onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>How X402 Works</h3>
        <ol style={styles.howList}>
          <li>Client requests a protected resource</li>
          <li>Server returns <code style={styles.inlineCode}>402 Payment Required</code> with payment details</li>
          <li>Extension detects 402, signs a Stellar payment</li>
          <li>Client retries with <code style={styles.inlineCode}>X-PAYMENT</code> header</li>
          <li>Server verifies payment, returns content</li>
        </ol>
      </div>
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
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
  },
  header: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  headerIcon: {
    fontSize: '36px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '4px',
    color: '#a855f7',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: '12px',
    margin: 0,
  },
  card: {
    background: '#1a1a1a',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    border: '1px solid #2a2a2a',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e5e5e5',
    marginTop: 0,
    marginBottom: '12px',
  },
  accountBox: {
    background: '#252525',
    borderRadius: '8px',
    padding: '12px',
  },
  accountHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  accountLabel: {
    color: '#e5e5e5',
    fontSize: '12px',
    fontWeight: 500,
  },
  accountRole: {
    color: '#a855f7',
    fontSize: '11px',
    fontWeight: 500,
  },
  emptyState: {
    textAlign: 'center',
    padding: '12px 0',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: '13px',
    marginBottom: '12px',
  },
  accountInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  balanceValue: {
    color: '#a855f7',
    fontSize: '16px',
    fontWeight: 600,
  },
  addressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressLabel: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  addressCode: {
    color: '#6366f1',
    fontSize: '11px',
    background: '#252525',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  btnPrimary: {
    background: '#a855f7',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
    marginTop: '8px',
  },
  btnSecondary: {
    background: '#2a2a2a',
    color: '#e5e5e5',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: '8px',
  },
  demoSection: {
    textAlign: 'center',
  },
  demoText: {
    color: '#9ca3af',
    fontSize: '12px',
    lineHeight: 1.5,
    marginBottom: '12px',
  },
  warningText: {
    color: '#f59e0b',
    fontSize: '11px',
    marginTop: '8px',
  },
  statusSection: {
    textAlign: 'center',
    padding: '20px 0',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #3a3a3a',
    borderTopColor: '#a855f7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 12px',
  },
  statusText: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  paymentRequired: {
    textAlign: 'center',
  },
  errorBadge: {
    display: 'inline-block',
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '12px',
  },
  successBadge: {
    display: 'inline-block',
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '12px',
  },
  requirementsList: {
    background: '#252525',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
    textAlign: 'left',
  },
  reqRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  reqLabel: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  reqValue: {
    color: '#e5e5e5',
    fontSize: '12px',
    fontWeight: 500,
  },
  noteText: {
    color: '#6b7280',
    fontSize: '11px',
    fontStyle: 'italic',
    marginBottom: '12px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
  },
  successSection: {
    textAlign: 'center',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  txLabel: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  txCode: {
    color: '#22c55e',
    fontSize: '11px',
    background: '#252525',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  contentBox: {
    background: '#252525',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
    textAlign: 'left',
  },
  contentTitle: {
    color: '#e5e5e5',
    fontSize: '12px',
    fontWeight: 500,
    marginTop: 0,
    marginBottom: '8px',
  },
  contentPre: {
    color: '#a855f7',
    fontSize: '11px',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  errorSection: {
    textAlign: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginBottom: '12px',
  },
  howList: {
    color: '#9ca3af',
    fontSize: '12px',
    paddingLeft: '20px',
    margin: 0,
    lineHeight: 1.8,
  },
  inlineCode: {
    background: '#252525',
    color: '#a855f7',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
  },
};
