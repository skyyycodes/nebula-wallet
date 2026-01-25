import React, { useState, useEffect, useCallback } from 'react';
import type { AccountData } from '../hooks/useWallet';
import type { BackgroundOption } from '../hooks/useBackground';
import { tokenService, POPULAR_STELLAR_ASSETS, getTokenLogoUrl, getTokenLogoUrlAsync } from '../services/token-service';
import { ImportTokens } from '../components/ImportTokens';

// Storage key for imported tokens
const IMPORTED_TOKENS_KEY = 'nebula_imported_tokens';

// Token with balance info
interface TokenWithBalance {
  code: string;
  issuer: string;
  name: string;
  icon?: string;
  logoUrl?: string;
  balance: string;
  usdValue?: number;
  priceChange?: number;
}

interface HomeProps {
  currentAccount: AccountData | null;
  balance: string;
  onReceive: () => void;
  onAirdrop: () => Promise<boolean>;
  onLock: () => Promise<boolean>;
  onOpenSend: () => void;
  onRefresh: () => void;
  onOpenTokenDetail?: (code: string, issuer: string) => void;
  onSwap: () => void;
  headerComponent?: React.ReactNode;
  backgroundStyle?: BackgroundOption;
  isFullscreen?: boolean;
  isMainnet?: boolean;
}

export function Home({
  currentAccount,
  balance,
  onReceive,
  onAirdrop,
  onLock,
  onOpenSend,
  onRefresh,
  onOpenTokenDetail,
  onSwap,
  headerComponent,
  backgroundStyle,
  isFullscreen,
  isMainnet = false,
}: HomeProps) {
  const [activeTab, setActiveTab] = useState<'tokens' | 'predictions' | 'earn' | 'collectibles'>('tokens');
  const [showLockModal, setShowLockModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTokenMenu, setShowTokenMenu] = useState(false);
  const [tokens, setTokens] = useState<TokenWithBalance[]>([]);
  const [importedTokens, setImportedTokens] = useState<Array<{ code: string; issuer: string }>>([]);

  // Load imported tokens on mount
  useEffect(() => {
    loadImportedTokens();
  }, []);

  // Load imported tokens from storage
  const loadImportedTokens = useCallback(async () => {
    try {
      const stored = localStorage.getItem(IMPORTED_TOKENS_KEY);
      if (stored) {
        setImportedTokens(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load imported tokens:', error);
    }
  }, []);

  // Listen for wallet updates (e.g., from swap page)
  useEffect(() => {
    const handleWalletUpdate = () => {
      console.log('[Home] Wallet updated, reloading imported tokens...');
      loadImportedTokens();
    };

    window.addEventListener('wallet-updated', handleWalletUpdate);
    return () => {
      window.removeEventListener('wallet-updated', handleWalletUpdate);
    };
  }, [loadImportedTokens]);

  // Save imported tokens to storage
  const saveImportedTokens = useCallback((tokens: Array<{ code: string; issuer: string }>) => {
    try {
      localStorage.setItem(IMPORTED_TOKENS_KEY, JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to save imported tokens:', error);
    }
  }, []);

  // Load token balances
  useEffect(() => {
    if (!currentAccount?.address) return;

    const loadTokens = async () => {
      // Check if tokens need refresh (e.g., after a swap)
      const needsRefresh = localStorage.getItem('nebula_tokens_need_refresh');
      if (needsRefresh === 'true') {
        console.log('[Home] Tokens need refresh, reloading from localStorage...');
        await loadImportedTokens();
        localStorage.removeItem('nebula_tokens_need_refresh');
      }

      const tokenList: TokenWithBalance[] = [];

      // FIRST: Fetch ALL actual balances from Horizon (including trustlines)
      const allBalances = await tokenService.getAllBalances(currentAccount.address);
      
      console.log('[Home] Fetched all balances from Horizon:', allBalances);

      // Add all tokens with actual balances
      for (const bal of allBalances) {
        const info = await tokenService.getTokenInfo(bal.code, bal.issuer);
        const price = isMainnet ? await tokenService.getTokenPrice(bal.code, bal.issuer) : null;
        
        // Find if it's a popular asset to get icon
        const popularAsset = POPULAR_STELLAR_ASSETS.find(
          a => a.code === bal.code && a.issuer === bal.issuer
        );

        tokenList.push({
          code: bal.code,
          issuer: bal.issuer,
          name: bal.name || info?.name || bal.code,
          icon: popularAsset?.icon || info?.icon,
          logoUrl: popularAsset?.logoUrl || getTokenLogoUrl(bal.code, bal.issuer),
          balance: bal.balance,
          usdValue: price ? parseFloat(bal.balance) * price.usd : undefined,
          priceChange: price?.usdChange24h,
        });
      }

      // THEN: Add any imported tokens that don't have balances yet (for display purposes)
      for (const imported of importedTokens) {
        // Skip if already in list (has balance)
        if (tokenList.some(t => t.code === imported.code && t.issuer === imported.issuer)) continue;

        const bal = await tokenService.getTokenBalance(currentAccount.address, imported.code, imported.issuer);
        if (parseFloat(bal) === 0) continue; // Skip zero balance imported tokens
        
        const info = await tokenService.getTokenInfo(imported.code, imported.issuer);
        const price = isMainnet ? await tokenService.getTokenPrice(imported.code, imported.issuer) : null;
        const logoUrl = await getTokenLogoUrlAsync(imported.code, imported.issuer);

        tokenList.push({
          code: imported.code,
          issuer: imported.issuer,
          name: info?.name || imported.code,
          icon: info?.icon,
          logoUrl: logoUrl,
          balance: bal,
          usdValue: price ? parseFloat(bal) * price.usd : undefined,
          priceChange: price?.usdChange24h,
        });
      }

      setTokens(tokenList);
    };

    loadTokens();
  }, [currentAccount?.address, balance, isMainnet, importedTokens]);

  // Handle token import
  const handleImportToken = useCallback((code: string, issuer: string) => {
    const newImported = [...importedTokens, { code, issuer }];
    setImportedTokens(newImported);
    saveImportedTokens(newImported);
    setShowImportModal(false);
  }, [importedTokens, saveImportedTokens]);

  // Refresh token list
  const handleRefreshTokens = useCallback(() => {
    onRefresh();
    setShowTokenMenu(false);
  }, [onRefresh]);

  const handleAirdrop = async () => {
    setIsLoading(true);
    await onAirdrop();
    setIsLoading(false);
  };

  const handleLock = async () => {
    setIsLoading(true);
    const success = await onLock();
    setIsLoading(false);
    if (success) setShowLockModal(false);
  };

  const balanceNum = parseFloat(balance) || 0;


  // Card content (balance + action buttons) - rendered inside wallet-card
  const cardContent = (
    <>
      {/* Balance Section */}
      <div className="balance-section">
        <div className="balance-label">
          BALANCE
          <svg className="balance-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div className="balance-amount">
          <span className="balance-value">{balanceNum.toFixed(2)}</span>
          <svg className="balance-hide" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </div>
        <div className="balance-change">XLM on Stellar Testnet</div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons in-card">
        <button className="action-button" onClick={onReceive}>
          <div className="action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
          <span className="action-label">Receive</span>
        </button>

        <button className="action-button" onClick={handleAirdrop} disabled={isLoading}>
          <div className="action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <span className="action-label">Airdrop</span>
        </button>

        <button className="action-button" onClick={onSwap}>
          <div className="action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4M7 4L3 8M7 4l4 4" />
              <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
            </svg>
          </div>
          <span className="action-label">Swap</span>
        </button>

        <button className="action-button" onClick={onOpenSend}>
          <div className="action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <span className="action-label">Send</span>
        </button>
      </div>
    </>
  );

  // Below card content (tabs + content + modals)
  const belowCardContent = (
    <>
      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          Tokens
        </button>
        <button
          className={`tab ${activeTab === 'predictions' ? 'active' : ''}`}
          onClick={() => setActiveTab('predictions')}
        >
          Predictions
        </button>
        <button
          className={`tab ${activeTab === 'earn' ? 'active' : ''}`}
          onClick={() => setActiveTab('earn')}
        >
          Earn
        </button>
        <button
          className={`tab ${activeTab === 'collectibles' ? 'active' : ''}`}
          onClick={() => setActiveTab('collectibles')}
        >
          Collectibles
        </button>
      </div>

      {/* Content */}
      <div className="content">
        {activeTab === 'tokens' && (
          <>
            {/* Token List Header with Menu */}
            <div className="token-list-header">
              <div className="token-list-network">
                <div className={`network-dot ${isMainnet ? 'mainnet' : 'testnet'}`} />
                <span>{isMainnet ? 'Mainnet' : 'Testnet'}</span>
              </div>
              <div className="token-list-actions">
                <button
                  className="token-menu-btn"
                  onClick={() => setShowTokenMenu(!showTokenMenu)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
                {showTokenMenu && (
                  <div className="token-menu-dropdown">
                    <button className="token-menu-item" onClick={() => { setShowImportModal(true); setShowTokenMenu(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Import tokens
                    </button>
                    <button className="token-menu-item" onClick={handleRefreshTokens}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Refresh list
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Token List */}
            {tokens.length > 0 ? (
              <div className="token-list">
                {tokens.map((token) => (
                  <div
                    key={`${token.code}-${token.issuer}`}
                    className="token-item clickable"
                    onClick={() => onOpenTokenDetail?.(token.code, token.issuer)}
                  >
                    <div className="token-info">
                      <div className={`token-icon ${token.code.toLowerCase()}-icon`}>
                        {token.logoUrl ? (
                          <img
                            src={token.logoUrl}
                            alt={token.code}
                            className="token-logo-img"
                            onError={(e) => {
                              // Fallback to placeholder on image load error
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div
                          className={`token-icon-placeholder ${token.logoUrl ? 'hidden' : ''}`}
                          style={{ background: getTokenColor(token.code) }}
                        >
                          {token.code.charAt(0)}
                        </div>
                      </div>
                      <div className="token-details">
                        <span className="token-name">{token.name}</span>
                        {isMainnet && token.usdValue !== undefined ? (
                          <span className="token-symbol">
                            ${token.usdValue.toFixed(2)}{' '}
                            {token.priceChange !== undefined && (
                              <span className={`price-change ${token.priceChange >= 0 ? 'positive' : 'negative'}`}>
                                {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(2)}%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="token-symbol testnet-label">
                            {isMainnet ? token.code : 'Testnet Token'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="token-balance">
                      <span className="token-amount">{parseFloat(token.balance).toFixed(4)} {token.code}</span>
                      {isMainnet && token.usdValue !== undefined && (
                        <span className="token-value">≈ ${token.usdValue.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : balanceNum === 0 ? (
              <div className="empty-state">
                <svg className="empty-icon" viewBox="0 0 120 120" fill="none">
                  <circle cx="60" cy="60" r="50" stroke="#333" strokeWidth="2" />
                  <text x="60" y="65" textAnchor="middle" fontSize="24" fill="#666">XLM</text>
                </svg>
                <h3 className="empty-title">Get started with XLM</h3>
                <p className="empty-description">
                  Use the Airdrop button to get testnet XLM and start exploring the Stellar network.
                </p>
                <button className="btn-primary" onClick={handleAirdrop} disabled={isLoading}>
                  {isLoading ? 'Loading...' : 'Get Testnet XLM'}
                </button>
              </div>
            ) : null}

            {/* Import Token Button */}
            {tokens.length > 0 && (
              <button className="add-asset-btn" onClick={() => setShowImportModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Import tokens
              </button>
            )}
          </>
        )}

        {activeTab === 'predictions' && (
          <div className="predictions-content">
            <div className="prediction-card">
              <div className="prediction-header">
                <div className="prediction-icon">🏈</div>
                <h4 className="prediction-title">Stellar Price Prediction</h4>
              </div>
              <div className="prediction-option">
                <div className="prediction-option-info">
                  <span className="prediction-option-name">Above $0.15 by Feb</span>
                  <span className="prediction-option-volume">$2.4M volume</span>
                </div>
                <span className="prediction-percent">62%</span>
                <div className="prediction-actions">
                  <button className="prediction-yes">Yes</button>
                  <span>/</span>
                  <button className="prediction-no">No</button>
                </div>
              </div>
              <div className="prediction-option">
                <div className="prediction-option-info">
                  <span className="prediction-option-name">Below $0.10 by Feb</span>
                  <span className="prediction-option-volume">$1.8M volume</span>
                </div>
                <span className="prediction-percent">38%</span>
                <div className="prediction-actions">
                  <button className="prediction-yes">Yes</button>
                  <span>/</span>
                  <button className="prediction-no">No</button>
                </div>
              </div>
              <div className="prediction-footer">
                <span className="prediction-total">$4.2M volume</span>
                <button className="prediction-details">Show details →</button>
              </div>
            </div>

            <div className="prediction-card">
              <div className="prediction-header">
                <div className="prediction-icon">📈</div>
                <h4 className="prediction-title">Crypto Market Cap</h4>
              </div>
              <div className="prediction-option">
                <div className="prediction-option-info">
                  <span className="prediction-option-name">$4T by March 2026</span>
                  <span className="prediction-option-volume">$8.1M volume</span>
                </div>
                <span className="prediction-percent">71%</span>
                <div className="prediction-actions">
                  <button className="prediction-yes">Yes</button>
                  <span>/</span>
                  <button className="prediction-no">No</button>
                </div>
              </div>
              <div className="prediction-footer">
                <span className="prediction-total">$12.5M volume</span>
                <button className="prediction-details">Show details →</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'earn' && (
          <div className="earn-content">
            <h3 className="earn-title">Earn with Stellar</h3>
            <p className="earn-subtitle">Effortless XLM Yield.</p>
            <p className="earn-description">Safe. Simple. In Your Hands</p>
            <button className="earn-btn">Start earning</button>
          </div>
        )}

        {activeTab === 'collectibles' && (
          <div className="collectibles-content">
            <h3 className="collectibles-title">Empty gallery</h3>
            <p className="collectibles-description">
              Start building your collection. Don't interact with collectibles you didn't expect to receive.
            </p>
          </div>
        )}
      </div>
    </>
  );

  // Render the complete home view with wallet card
  // Calculate dynamic wallet card styles
  const walletCardStyle: React.CSSProperties = backgroundStyle ? (
    backgroundStyle.type === 'gradient'
      ? { background: backgroundStyle.value }
      : {
        backgroundImage: `url(${backgroundStyle.value})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
  ) : {};

  // Determine text color based on background
  const textColorClass = backgroundStyle?.textColor === 'light' ? 'light-text' : 'dark-text';

  return (
    <>
      {/* Wallet Card */}
      <div className={`wallet-card ${textColorClass}`} style={walletCardStyle}>
        {headerComponent}
        {cardContent}
      </div>

      {/* Below Card Content */}
      {belowCardContent}

      {/* Lock Confirmation Modal */}
      {showLockModal && (
        <div className="modal-overlay" onClick={() => setShowLockModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Lock Wallet</h3>
            <p className="modal-description">
              This will permanently lock your wallet with quantum security.
              <br /><br />
              After locking:<br />
              - Ed25519 private key can NEVER sign transactions<br />
              - Only SPHINCS+ signed preAuthTx can move funds<br />
              - This is IRREVERSIBLE
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => setShowLockModal(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={handleLock}
                disabled={isLoading}
              >
                {isLoading ? 'Locking...' : 'Lock Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Tokens Modal */}
      <ImportTokens
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportToken}
        importedTokens={importedTokens}
      />
    </>
  );
}

// Helper function to generate consistent colors for tokens
function getTokenColor(code: string): string {
  const colors: Record<string, string> = {
    'USDC': 'linear-gradient(135deg, #2775ca 0%, #1a5fb4 100%)',
    'yXLM': 'linear-gradient(135deg, #f5d742 0%, #d4b52a 100%)',
    'AQUA': 'linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)',
    'SHX': 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
    'RMT': 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
  };

  if (colors[code]) return colors[code];

  // Generate a color based on the code
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%) 0%, hsl(${hue}, 70%, 40%) 100%)`;
}