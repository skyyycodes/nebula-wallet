import React, { useState, useEffect } from 'react';
import type { AccountData } from '../hooks/useWallet';

interface WalletKeys {
  stellarPublicKey: string;
  stellarSecretKey: string;
  sphincsPublicKey: string;
  sphincsSecretKey: string;
  isLocked: boolean;
}

interface SettingsProps {
  currentAccount: AccountData | null;
  onDeleteAccount: (accountId: string) => Promise<boolean>;
}

export function Settings({ currentAccount, onDeleteAccount }: SettingsProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSecurityView, setShowSecurityView] = useState(false);
  const [walletKeys, setWalletKeys] = useState<WalletKeys | null>(null);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [keyToReveal, setKeyToReveal] = useState<'stellar' | 'sphincs' | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<{ stellar: boolean; sphincs: boolean }>({ stellar: false, sphincs: false });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [isNetworkSwitching, setIsNetworkSwitching] = useState(false);

  useEffect(() => {
    // Fetch current network on mount
    console.log('[Settings] Fetching initial network state...');
    chrome.runtime.sendMessage({ type: 'GET_NETWORK' }, (response) => {
      console.log('[Settings] GET_NETWORK response:', response);
      if (response?.success) {
        console.log('[Settings] Setting initial network to:', response.data.network);
        setNetwork(response.data.network);
      }
    });
  }, []);

  useEffect(() => {
    console.log('[Settings] Network state changed to:', network);
  }, [network]);

  useEffect(() => {
    if (showSecurityView) {
      chrome.runtime.sendMessage({ type: 'GET_WALLET_KEYS' }, (response) => {
        if (response?.success) {
          setWalletKeys(response.data);
        }
      });
    }
  }, [showSecurityView]);

  const handleNetworkToggle = async () => {
    const newNetwork = network === 'testnet' ? 'mainnet' : 'testnet';
    console.log('[Settings] Toggling network from', network, 'to', newNetwork);
    setIsNetworkSwitching(true);
    chrome.runtime.sendMessage({ type: 'SET_NETWORK', payload: { network: newNetwork } }, (response) => {
      console.log('[Settings] SET_NETWORK response:', response);
      setIsNetworkSwitching(false);
      if (response?.success) {
        console.log('[Settings] Updating network state to:', response.data.network);
        setNetwork(response.data.network);
      } else {
        console.error('[Settings] Failed to set network:', response?.error);
      }
    });
  };

  const handleRevealKey = (keyType: 'stellar' | 'sphincs') => {
    setKeyToReveal(keyType);
    setShowRevealModal(true);
  };

  const confirmReveal = () => {
    if (keyToReveal) {
      setRevealedKeys(prev => ({ ...prev, [keyToReveal]: true }));
    }
    setShowRevealModal(false);
    setKeyToReveal(null);
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const truncateKey = (key: string, length: number = 20) => {
    if (key.length <= length * 2) return key;
    return `${key.slice(0, length)}...${key.slice(-length)}`;
  };

  const handleDelete = async () => {
    if (!currentAccount) return;
    setIsDeleting(true);
    const success = await onDeleteAccount(currentAccount.id);
    setIsDeleting(false);
    if (success) setShowDeleteModal(false);
  };

  const settingsItems = [
    {
      id: 'network',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      title: 'Network',
      description: network === 'testnet' ? 'Stellar Testnet' : 'Stellar Mainnet',
      hasToggle: true,
    },
    {
      id: 'general',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      ),
      title: 'General',
      description: 'Wallet preferences',
    },
    {
      id: 'address',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      title: 'Address book',
      description: 'Manage your contacts',
    },
    {
      id: 'security',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: 'Security & Privacy',
      description: currentAccount?.isLocked ? 'Quantum Secure (SPHINCS+)' : 'Standard Ed25519',
      badge: currentAccount?.isLocked ? 'Quantum Safe' : undefined,
    },
    {
      id: 'support',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      title: 'Support',
      description: 'Get help with your wallet',
      external: true,
    },
    {
      id: 'expanded',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6" />
          <path d="M10 14L21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      ),
      title: 'Expanded view',
      description: 'Open wallet in browser tab',
      external: true,
    },
  ];

  // Security Detail View
  if (showSecurityView) {
    return (
      <div className="content">
        <div className="settings-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button
              onClick={() => {
                setShowSecurityView(false);
                setRevealedKeys({ stellar: false, sphincs: false });
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="settings-title" style={{ margin: 0 }}>Security & Privacy</h2>
          </div>

          {walletKeys && (
            <>
              {/* Status Badge */}
              <div style={{
                background: walletKeys.isLocked ? 'rgba(0, 214, 143, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                border: `1px solid ${walletKeys.isLocked ? '#00d68f' : '#ffc107'}`,
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={walletKeys.isLocked ? '#00d68f' : '#ffc107'} strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <div>
                  <div style={{ color: walletKeys.isLocked ? '#00d68f' : '#ffc107', fontWeight: 500 }}>
                    {walletKeys.isLocked ? 'Quantum Secure Mode' : 'Standard Mode'}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px' }}>
                    {walletKeys.isLocked ? 'Protected by SPHINCS+ signatures' : 'Using Ed25519 signatures'}
                  </div>
                </div>
              </div>

              {/* ECDSA / Stellar Keys */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                  Stellar Keys (Ed25519)
                  {walletKeys.isLocked && (
                    <span style={{ fontSize: '10px', background: 'rgba(255, 107, 107, 0.15)', color: '#ff6b6b', padding: '2px 6px', borderRadius: '4px' }}>
                      Locked
                    </span>
                  )}
                </h3>

                {/* Public Key */}
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px' }}>Public Key</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ color: '#fff', fontSize: '11px', wordBreak: 'break-all', flex: 1 }}>
                      {walletKeys.stellarPublicKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(walletKeys.stellarPublicKey, 'Stellar Public Key')}
                      style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Secret Key */}
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px' }}>Secret Key</div>
                  {revealedKeys.stellar ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ color: '#ff6b6b', fontSize: '11px', wordBreak: 'break-all', flex: 1 }}>
                        {walletKeys.stellarSecretKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(walletKeys.stellarSecretKey, 'Stellar Secret Key')}
                        style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRevealKey('stellar')}
                      style={{
                        background: 'rgba(255, 107, 107, 0.1)',
                        border: '1px solid #ff6b6b',
                        borderRadius: '6px',
                        color: '#ff6b6b',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Reveal Secret Key
                    </button>
                  )}
                </div>
              </div>

              {/* SPHINCS+ Keys */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d68f" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  SPHINCS+ Keys (Quantum-Safe)
                  <span style={{ fontSize: '10px', background: 'rgba(0, 214, 143, 0.15)', color: '#00d68f', padding: '2px 6px', borderRadius: '4px' }}>
                    Post-Quantum
                  </span>
                </h3>

                {/* Public Key */}
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px' }}>Public Key (Base64)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ color: '#00d68f', fontSize: '11px', wordBreak: 'break-all', flex: 1 }}>
                      {truncateKey(walletKeys.sphincsPublicKey, 30)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(walletKeys.sphincsPublicKey, 'SPHINCS+ Public Key')}
                      style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Secret Key */}
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px' }}>Secret Key (Base64)</div>
                  {revealedKeys.sphincs ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ color: '#ff6b6b', fontSize: '11px', wordBreak: 'break-all', flex: 1 }}>
                        {truncateKey(walletKeys.sphincsSecretKey, 30)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(walletKeys.sphincsSecretKey, 'SPHINCS+ Secret Key')}
                        style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRevealKey('sphincs')}
                      style={{
                        background: 'rgba(255, 107, 107, 0.1)',
                        border: '1px solid #ff6b6b',
                        borderRadius: '6px',
                        color: '#ff6b6b',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Reveal Secret Key
                    </button>
                  )}
                </div>
              </div>

              {/* Warning Notice */}
              <div style={{
                background: 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                gap: '10px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div style={{ color: '#888', fontSize: '12px', lineHeight: '1.5' }}>
                  <strong style={{ color: '#ffc107' }}>Never share your secret keys!</strong><br />
                  Anyone with access to your secret keys can steal your funds. Store them securely.
                </div>
              </div>
            </>
          )}

          {/* Copy Feedback Toast */}
          {copyFeedback && (
            <div style={{
              position: 'fixed',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#00d68f',
              color: '#000',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              zIndex: 1000
            }}>
              {copyFeedback} copied!
            </div>
          )}

          {/* Reveal Confirmation Modal */}
          {showRevealModal && (
            <div className="modal-overlay" onClick={() => setShowRevealModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title" style={{ color: '#ff6b6b' }}>Reveal Secret Key?</h3>
                <p className="modal-description">
                  You are about to reveal your {keyToReveal === 'stellar' ? 'Stellar Ed25519' : 'SPHINCS+'} secret key.
                  <br /><br />
                  <strong style={{ color: '#ff6b6b' }}>Warning:</strong> Never share this key with anyone. Anyone with this key can access your funds.
                </p>
                <div className="modal-actions">
                  <button
                    className="modal-btn cancel"
                    onClick={() => setShowRevealModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="modal-btn confirm"
                    onClick={confirmReveal}
                    style={{ background: '#ff6b6b' }}
                  >
                    Reveal Key
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="settings-container">
        <h2 className="settings-title">Settings</h2>

        {settingsItems.map((item) => (
          <div
            key={item.id}
            className="settings-item"
            onClick={() => {
              if (item.id === 'security') setShowSecurityView(true);
            }}
            style={{ cursor: item.id === 'security' ? 'pointer' : undefined }}
          >
            <div className="settings-item-left">
              <span className="settings-icon">{item.icon}</span>
              <div className="settings-item-text">
                <span className="settings-item-title">
                  {item.title}
                  {item.badge && (
                    <span style={{
                      marginLeft: '8px',
                      fontSize: '10px',
                      background: 'rgba(0, 214, 143, 0.15)',
                      color: '#00d68f',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="settings-item-description">{item.description}</span>
              </div>
            </div>
            {item.hasToggle ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNetworkToggle();
                }}
                disabled={isNetworkSwitching}
                style={{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: isNetworkSwitching ? 'wait' : 'pointer',
                  background: network === 'mainnet' ? '#00d68f' : '#333',
                  transition: 'background 0.2s',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: network === 'mainnet' ? '22px' : '2px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isNetworkSwitching && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  )}
                </span>
              </button>
            ) : item.external ? (
              <svg className="settings-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            ) : (
              <svg className="settings-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </div>
        ))}

        {/* Danger Zone */}
        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #2a2a2a' }}>
          <div
            className="settings-item"
            style={{ color: '#ff6b6b' }}
            onClick={() => setShowDeleteModal(true)}
          >
            <div className="settings-item-left">
              <span className="settings-icon" style={{ color: '#ff6b6b' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </span>
              <div className="settings-item-text">
                <span className="settings-item-title" style={{ color: '#ff6b6b' }}>Delete Account</span>
                <span className="settings-item-description">Permanently remove this account</span>
              </div>
            </div>
          </div>
        </div>

        {/* Version Info */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#444' }}>
            Nebula Wallet v1.0.0
          </p>
          <p style={{ fontSize: '11px', color: '#333', marginTop: '4px' }}>
            Powered by SPHINCS+ Post-Quantum Signatures
          </p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Delete Account</h3>
            <p className="modal-description">
              Are you sure you want to delete this account?
              <br /><br />
              This will permanently delete the account and all associated keys.
              Make sure you have backed up any funds!
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
