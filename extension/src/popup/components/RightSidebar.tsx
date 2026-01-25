import React, { useState, useEffect, useCallback } from 'react';
import {
  getDexAggregator,
  Quote,
  AssetId,
  DexSource,
} from '../../modules/dex';
import { getAccountService } from '../../modules/wallet';

interface RightSidebarProps {
  balance: string;
  publicKey?: string;
  onSwap?: () => void;
}

// Common testnet assets
const TESTNET_ASSETS: { code: string; issuer: string | null; name: string; color: string }[] = [
  { code: 'XLM', issuer: null, name: 'Stellar Lumens', color: '#667eea' },
  { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', name: 'USD Coin', color: '#2775ca' },
  { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B', name: 'SRT Token', color: '#00c853' },
];

type SwapState = 'idle' | 'quoting' | 'executing' | 'success' | 'error';

export function RightSidebar({ balance, publicKey, onSwap }: RightSidebarProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('1M');

  // Swap state
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAsset, setSellAsset] = useState(TESTNET_ASSETS[0]);
  const [buyAsset, setBuyAsset] = useState(TESTNET_ASSETS[1]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [swapState, setSwapState] = useState<SwapState>('idle');
  const [slippage, setSlippage] = useState(0.5);
  const [buyAssetBalance, setBuyAssetBalance] = useState('0');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string>('');

  const periods = ['1D', '1W', '1M', '1Y', 'ALL'];

  // Fetch buy asset balance
  useEffect(() => {
    if (publicKey && buyAsset) {
      const fetchBalance = async () => {
        try {
          const accountService = getAccountService();
          const bal = await accountService.getAssetBalance(
            publicKey,
            buyAsset.code,
            buyAsset.issuer || undefined
          );
          setBuyAssetBalance(bal?.availableBalance || '0');
        } catch {
          setBuyAssetBalance('0');
        }
      };
      fetchBalance();
    }
  }, [publicKey, buyAsset]);

  // Debounced quote fetching
  useEffect(() => {
    const fetchQuote = async () => {
      if (!sellAmount || parseFloat(sellAmount) <= 0) {
        setQuote(null);
        setBuyAmount('');
        return;
      }

      setSwapState('quoting');
      setError(null);

      try {
        const aggregator = getDexAggregator();
        const sourceAsset: AssetId = { code: sellAsset.code, issuer: sellAsset.issuer };
        const destAsset: AssetId = { code: buyAsset.code, issuer: buyAsset.issuer };

        const result = await aggregator.getQuote({
          sourceAsset,
          destAsset,
          amount: sellAmount,
          swapType: 'exactIn',
          slippageTolerance: slippage / 100,
          userPublicKey: publicKey,
        });

        if (result.bestQuote) {
          setQuote(result.bestQuote);
          setBuyAmount(parseFloat(result.bestQuote.destAmount).toFixed(4));
          setSwapState('idle');
        } else {
          setError('No liquidity found');
          setSwapState('error');
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get quote';
        setError(errorMessage);
        setSwapState('error');
      }
    };

    const timeoutId = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [sellAmount, sellAsset, buyAsset, slippage, publicKey]);

  // Switch assets
  const handleSwitchAssets = useCallback(() => {
    const tempAsset = sellAsset;
    setSellAsset(buyAsset);
    setBuyAsset(tempAsset);
    setSellAmount(buyAmount);
    setBuyAmount(sellAmount);
  }, [sellAsset, buyAsset, sellAmount, buyAmount]);

  // Handle percentage buttons
  const handlePercentage = (percent: number) => {
    const available = parseFloat(balance.replace(/,/g, ''));
    if (!isNaN(available)) {
      const amount = (available * percent / 100).toFixed(4);
      setSellAmount(amount);
    }
  };

  // Execute swap
  const handleSwap = async () => {
    if (!quote || !publicKey) {
      setError('Missing wallet credentials');
      return;
    }

    setSwapState('executing');
    setError(null);

    try {
      setExecutionStatus('Building quantum-safe transaction...');

      const response = await chrome.runtime.sendMessage({
        type: 'SWAP_TOKENS',
        payload: {
          sendAsset: { code: quote.sourceAsset.code, issuer: quote.sourceAsset.issuer },
          destAsset: { code: quote.destAsset.code, issuer: quote.destAsset.issuer },
          sendAmount: quote.sourceAmount,
          destMinAmount: quote.minimumReceived,
          pathAssets: quote.route.path
        }
      });

      if (response.success) {
        setSwapState('success');
        setExecutionStatus(`Swap complete!`);

        localStorage.setItem('nebula_tokens_need_refresh', 'true');
        window.dispatchEvent(new CustomEvent('wallet-updated'));

        setTimeout(() => {
          setSellAmount('');
          setBuyAmount('');
          setQuote(null);
          setSwapState('idle');
          setExecutionStatus('');
        }, 3000);
      } else {
        setError(response.error || 'Swap failed');
        setSwapState('error');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Swap failed';
      setError(errorMessage);
      setSwapState('error');
    }
  };

  // Get button text based on state
  const getButtonText = () => {
    switch (swapState) {
      case 'quoting':
        return 'Getting quote...';
      case 'executing':
        return executionStatus || 'Executing...';
      case 'success':
        return '✓ Swap complete!';
      case 'error':
        return 'Try again';
      default:
        if (!sellAmount || parseFloat(sellAmount) <= 0) {
          return 'Enter amount';
        }
        if (!quote) {
          return 'Enter amount';
        }
        return `Swap ${sellAsset.code} → ${buyAsset.code}`;
    }
  };

  const isButtonDisabled =
    swapState === 'quoting' ||
    swapState === 'executing' ||
    !sellAmount ||
    parseFloat(sellAmount) <= 0 ||
    !quote ||
    !publicKey;

  return (
    <aside className="right-sidebar">
      {/* Token Balance History */}
      <div className="sidebar-card">
        <div className="sidebar-card-header">
          <span className="sidebar-card-title">TOKEN BALANCE HISTORY</span>
          <button className="expand-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        <div className="balance-history-value">
          <span className="history-amount">${balance}</span>
          <span className="history-date">{new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Simple Chart Placeholder */}
        <div className="chart-container">
          <svg viewBox="0 0 300 100" className="balance-chart">
            <defs>
              <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#9945FF" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#9945FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 80 Q30 70, 60 75 T120 60 T180 65 T240 45 T300 50 V100 H0 Z"
              fill="url(#chartGradient)"
            />
            <path
              d="M0 80 Q30 70, 60 75 T120 60 T180 65 T240 45 T300 50"
              fill="none"
              stroke="#9945FF"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="period-selector">
          {periods.map((period) => (
            <button
              key={period}
              className={`period-btn ${selectedPeriod === period ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Swap Widget */}
      <div className="sidebar-card swap-card">
        <div className="sidebar-card-header">
          <span className="sidebar-card-title">Swap</span>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#999' }}>Slippage Tolerance</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[0.1, 0.5, 1.0].map(val => (
                  <button
                    key={val}
                    onClick={() => setSlippage(val)}
                    className="percent-btn"
                    style={{
                      background: slippage === val ? '#667eea' : undefined,
                    }}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sell Section */}
        <div className="swap-section">
          <div className="swap-section-header">
            <span className="swap-label">Sell</span>
            <div className="swap-percentages">
              <button className="percent-btn" onClick={() => handlePercentage(25)}>25%</button>
              <button className="percent-btn" onClick={() => handlePercentage(50)}>50%</button>
              <button className="percent-btn" onClick={() => handlePercentage(75)}>75%</button>
              <button className="percent-btn" onClick={() => handlePercentage(100)}>Max</button>
            </div>
          </div>
          <div className="swap-input-row">
            <button className="token-selector">
              <div className="token-icon-small" style={{ background: sellAsset.color, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </div>
              <span>{sellAsset.code}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <input
              type="number"
              className="swap-input"
              placeholder="0"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
            />
          </div>
          <span className="token-balance">Balance: {balance} {sellAsset.code}</span>
        </div>

        {/* Swap Direction Button */}
        <div className="swap-direction">
          <button className="swap-direction-btn" onClick={handleSwitchAssets}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
            </svg>
          </button>
        </div>

        {/* Buy Section */}
        <div className="swap-section">
          <div className="swap-section-header">
            <span className="swap-label">Buy</span>
          </div>
          <div className="swap-input-row">
            <button className="token-selector">
              <div className="token-icon-small" style={{ background: buyAsset.color, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                  <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold">$</text>
                </svg>
              </div>
              <span>{buyAsset.code}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <input
              type="number"
              className="swap-input"
              placeholder="0"
              value={buyAmount}
              readOnly
              style={{ color: swapState === 'quoting' ? '#666' : undefined }}
            />
          </div>
          <span className="token-balance">Balance: {buyAssetBalance} {buyAsset.code}</span>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            margin: '8px 0',
            padding: '6px',
            background: 'rgba(255,107,107,0.1)',
            borderRadius: '4px',
            color: '#ff6b6b',
            fontSize: '11px',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Quote Details */}
        {quote && swapState !== 'quoting' && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '6px',
            padding: '8px',
            margin: '8px 0',
            fontSize: '11px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ color: '#888' }}>Rate</span>
              <span style={{ color: '#fff' }}>1 {sellAsset.code} = {quote.rate.toFixed(4)} {buyAsset.code}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Source</span>
              <span style={{ color: '#667eea' }}>{quote.source === DexSource.STELLAR_SDEX ? 'Stellar DEX' : quote.source}</span>
            </div>
          </div>
        )}

        <button
          className="swap-submit-btn"
          onClick={isButtonDisabled ? onSwap : handleSwap}
          disabled={swapState === 'executing'}
          style={{
            background: swapState === 'success' ? '#4ade80' :
                       swapState === 'error' ? '#ff6b6b' :
                       isButtonDisabled ? '#333' : '#667eea',
            cursor: swapState === 'executing' ? 'not-allowed' : 'pointer',
          }}
        >
          {getButtonText()}
        </button>

        {/* Network Indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '4px',
          marginTop: '8px',
          fontSize: '10px',
          color: '#666',
        }}>
          <span style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: '#fbbf24',
          }} />
          Testnet
        </div>
      </div>
    </aside>
  );
}
