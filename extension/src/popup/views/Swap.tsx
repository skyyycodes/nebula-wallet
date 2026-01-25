import React, { useState, useEffect, useCallback } from 'react';
import {
  getDexAggregator,
  AggregatedQuote,
  Quote,
  AssetId,
  DexSource,
} from '../../modules/dex';
import {
  getSwapExecutor,
  ExecutionMode,
  ExecutionStatus,
} from '../../modules/execution';
import { getNetworkManager, NetworkType } from '../../modules/network';
import { getAccountService } from '../../modules/wallet';

interface SwapProps {
  balance: string;
  publicKey?: string;
  secretKey?: string;
}

// Testnet assets (only assets that exist on Stellar testnet)
const TESTNET_ASSETS: { code: string; issuer: string | null; name: string; color: string }[] = [
  { code: 'XLM', issuer: null, name: 'Stellar Lumens', color: '#667eea' },
  { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', name: 'USD Coin', color: '#2775ca' },
  { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B', name: 'SRT Token', color: '#00c853' },
];

// Mainnet assets (real assets on Stellar mainnet)
const MAINNET_ASSETS: { code: string; issuer: string | null; name: string; color: string }[] = [
  { code: 'XLM', issuer: null, name: 'Stellar Lumens', color: '#667eea' },
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', name: 'USD Coin', color: '#2775ca' },
  { code: 'AQUA', issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA', name: 'Aquarius', color: '#00bfff' },
  { code: 'yXLM', issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55', name: 'Ultra Stellar', color: '#ffd700' },
  { code: 'BTC', issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM', name: 'Bitcoin (Ultra)', color: '#f7931a' },
  { code: 'ETH', issuer: 'GDLGAWYQ75JVOOXPCJBGE23KSEVWXRCMEHGNTDZNTPUWZPHLNE5MYQRA', name: 'Ethereum (Ultra)', color: '#627eea' },
];

type SwapState = 'idle' | 'loading' | 'quoting' | 'confirming' | 'executing' | 'success' | 'error';

export function Swap({ balance, publicKey, secretKey }: SwapProps) {
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAsset, setSellAsset] = useState(TESTNET_ASSETS[0]);
  const [buyAsset, setBuyAsset] = useState(TESTNET_ASSETS[1]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
  const [swapState, setSwapState] = useState<SwapState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(0.5); // 0.5%
  const [showSettings, setShowSettings] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string>('');
  const [networkType, setNetworkType] = useState<NetworkType>(NetworkType.TESTNET);
  const [buyAssetBalance, setBuyAssetBalance] = useState('0');
  const [showSellDropdown, setShowSellDropdown] = useState(false);
  const [showBuyDropdown, setShowBuyDropdown] = useState(false);

  // Get available assets based on network type
  const availableAssets = networkType === NetworkType.MAINNET ? MAINNET_ASSETS : TESTNET_ASSETS;

  // Fetch network type on mount
  useEffect(() => {
    const networkManager = getNetworkManager();
    const currentNetwork = networkManager.getNetworkType();
    setNetworkType(currentNetwork);
  }, []);

  // Reset assets when network changes
  useEffect(() => {
    const assets = networkType === NetworkType.MAINNET ? MAINNET_ASSETS : TESTNET_ASSETS;
    setSellAsset(assets[0]);
    setBuyAsset(assets[1]);
  }, [networkType]);

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
          setAllQuotes(result.allQuotes);
          setBuyAmount(parseFloat(result.bestQuote.destAmount).toFixed(4));
          setSwapState('idle');
        } else {
          setError('No liquidity found for this pair');
          setSwapState('error');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to get quote');
        setSwapState('error');
      }
    };

    const timeoutId = setTimeout(fetchQuote, 500); // 500ms debounce
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

  // Execute swap
  const handleSwap = async () => {
    if (!quote || !publicKey) {
      setError('Missing wallet credentials');
      return;
    }

    setSwapState('executing');
    setError(null);

    try {
      // Check if wallet is locked (quantum-safe mode)
      const walletResponse = await chrome.runtime.sendMessage({ type: 'GET_WALLET' });
      const isLocked = walletResponse?.data?.isLocked;

      if (isLocked) {
        // Use quantum-safe flow through background script and relayer
        console.log('[Swap] Using quantum-safe swap flow via relayer');

        // Step 1: Check for required trustlines
        setExecutionStatus('Checking trustlines...');
        const executor = getSwapExecutor();
        const trustlineCheck = await executor.checkTrustlines(publicKey, quote);

        if (!trustlineCheck.hasAllTrustlines) {
          console.log('[Swap] Missing trustlines:', trustlineCheck.missingTrustlines);
          setExecutionStatus('Creating trustlines...');

          // Create trustlines through background
          for (const asset of trustlineCheck.missingTrustlines) {
            console.log('[Swap] Adding trustline for:', asset.code);
            const trustlineResponse = await chrome.runtime.sendMessage({
              type: 'ADD_TRUSTLINE',
              payload: {
                assetCode: asset.code,
                assetIssuer: asset.issuer
              }
            });

            if (!trustlineResponse.success) {
              setError(`Failed to add trustline for ${asset.code}: ${trustlineResponse.error}`);
              setSwapState('error');
              return;
            }
            console.log('[Swap] Trustline added for:', asset.code);

            // Add to imported tokens so it shows in the tokens list
            try {
              const IMPORTED_TOKENS_KEY = 'nebula_imported_tokens';
              const existingTokensStr = localStorage.getItem(IMPORTED_TOKENS_KEY);
              const existingTokens = existingTokensStr ? JSON.parse(existingTokensStr) : [];

              // Check if token already exists
              const tokenExists = existingTokens.some(
                (t: any) => t.code === asset.code && t.issuer === asset.issuer
              );

              if (!tokenExists) {
                existingTokens.push({
                  code: asset.code,
                  issuer: asset.issuer
                });
                localStorage.setItem(IMPORTED_TOKENS_KEY, JSON.stringify(existingTokens));
                console.log('[Swap] Added token to imported list:', asset.code);
              }
            } catch (error) {
              console.error('[Swap] Failed to add token to imported list:', error);
            }
          }

          // Wait a moment for trustlines to be confirmed
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Step 2: Execute the swap
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
          setExecutionStatus(`Swap complete! Hash: ${response.data.txHash.slice(0, 8)}...`);

          // Trigger refresh by setting a flag in localStorage
          localStorage.setItem('nebula_tokens_need_refresh', 'true');

          // Dispatch event to trigger balance refresh in Home component
          window.dispatchEvent(new CustomEvent('wallet-updated'));

          // Reset after success
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
      } else {
        // Use traditional flow for unlocked wallets
        if (!secretKey) {
          setError('Secret key required for unlocked wallet');
          setSwapState('error');
          return;
        }

        const executor = getSwapExecutor();
        const result = await executor.executeSwap(
          {
            quote,
            userPublicKey: publicKey,
            secretKey,
            mode: ExecutionMode.IMMEDIATE,
            slippageTolerance: slippage / 100,
          },
          {
            onProgress: (status, details) => {
              setExecutionStatus(details || status);
            },
            useDynamicFee: true,
          }
        );

        if (result.success) {
          setSwapState('success');
          setExecutionStatus(`Swap complete! Hash: ${result.transactionHash.slice(0, 8)}...`);
          // Reset after success
          setTimeout(() => {
            setSellAmount('');
            setBuyAmount('');
            setQuote(null);
            setSwapState('idle');
            setExecutionStatus('');
          }, 3000);
        } else {
          setError(result.error || 'Swap failed');
          setSwapState('error');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Swap execution failed');
      setSwapState('error');
    }
  };

  // Set percentage of balance
  const handlePercentage = (percent: number) => {
    const available = parseFloat(balance.replace(/,/g, ''));
    if (!isNaN(available)) {
      const amount = (available * percent / 100).toFixed(4);
      setSellAmount(amount);
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
  // Note: secretKey not required for locked (quantum-safe) wallets

  return (
    <div className="content">
      <div className="sidebar-card swap-card">
        <div className="sidebar-card-header">
          <span className="sidebar-card-title">Swap</span>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
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
          <div className="swap-settings-panel" style={{
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
                    className={`percent-btn ${slippage === val ? 'active' : ''}`}
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
            <div style={{ position: 'relative' }}>
              <button
                className="token-selector"
                onClick={() => {
                  setShowSellDropdown(!showSellDropdown);
                  setShowBuyDropdown(false);
                }}
              >
                <div className="token-icon-small" style={{ background: sellAsset.color }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                </div>
                <span>{sellAsset.code}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showSellDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '4px',
                  minWidth: '140px',
                  zIndex: 100,
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {availableAssets.filter(asset => asset.code !== buyAsset.code).map((asset) => (
                    <button
                      key={asset.code}
                      onClick={() => {
                        setSellAsset(asset);
                        setShowSellDropdown(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px',
                        background: sellAsset.code === asset.code ? 'rgba(102,126,234,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: asset.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                          <circle cx="12" cy="12" r="8" />
                        </svg>
                      </div>
                      <span>{asset.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <div style={{ position: 'relative' }}>
              <button
                className="token-selector"
                onClick={() => {
                  setShowBuyDropdown(!showBuyDropdown);
                  setShowSellDropdown(false);
                }}
              >
                <div className="token-icon-small" style={{ background: buyAsset.color }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill={buyAsset.color} />
                    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">$</text>
                  </svg>
                </div>
                <span>{buyAsset.code}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showBuyDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '4px',
                  minWidth: '140px',
                  zIndex: 100,
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {availableAssets.filter(asset => asset.code !== sellAsset.code).map((asset) => (
                    <button
                      key={asset.code}
                      onClick={() => {
                        setBuyAsset(asset);
                        setShowBuyDropdown(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px',
                        background: buyAsset.code === asset.code ? 'rgba(102,126,234,0.3)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: asset.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                          <circle cx="12" cy="12" r="8" />
                        </svg>
                      </div>
                      <span>{asset.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="number"
              className="swap-input"
              placeholder="0"
              value={buyAmount}
              readOnly
              style={{
                color: swapState === 'quoting' ? '#666' : '#fff',
              }}
            />
          </div>
          <span className="token-balance">Balance: {buyAssetBalance} {buyAsset.code}</span>
        </div>

        {/* Quote Details */}
        {quote && swapState !== 'quoting' && (
          <div className="swap-quote-details" style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '12px',
            marginTop: '12px',
            fontSize: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#999' }}>Rate</span>
              <span style={{ color: '#fff' }}>
                1 {sellAsset.code} = {quote.rate.toFixed(6)} {buyAsset.code}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#999' }}>Price Impact</span>
              <span style={{ color: quote.priceImpact < -1 ? '#ff6b6b' : '#4ade80' }}>
                {quote.priceImpact.toFixed(2)}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#999' }}>Min. Received</span>
              <span style={{ color: '#fff' }}>
                {parseFloat(quote.minimumReceived).toFixed(4)} {buyAsset.code}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#999' }}>Network Fee</span>
              <span style={{ color: '#fff' }}>~{quote.estimatedFee} XLM</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ color: '#999' }}>Source</span>
              <span style={{ color: '#667eea' }}>{quote.source === DexSource.STELLAR_SDEX ? 'Stellar DEX' : quote.source}</span>
            </div>
            {quote.warnings.length > 0 && (
              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255,107,107,0.1)', borderRadius: '4px' }}>
                {quote.warnings.map((w, i) => (
                  <div key={i} style={{ color: '#ff6b6b', fontSize: '11px' }}>{w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(255,107,107,0.1)',
            borderRadius: '4px',
            color: '#ff6b6b',
            fontSize: '12px',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Swap Button */}
        <button
          className="swap-submit-btn"
          disabled={isButtonDisabled}
          onClick={handleSwap}
          style={{
            background: swapState === 'success' ? '#4ade80' :
              swapState === 'error' ? '#ff6b6b' :
                isButtonDisabled ? '#333' : '#667eea',
            color: isButtonDisabled ? '#666' : '#fff',
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {getButtonText()}
        </button>

        {/* Network Indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '6px',
          marginTop: '12px',
          fontSize: '11px',
          color: '#666',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: networkType === NetworkType.TESTNET ? '#fbbf24' : '#4ade80',
          }} />
          {networkType === NetworkType.TESTNET ? 'Testnet' : 'Mainnet'}
        </div>
      </div>
    </div>
  );
}

