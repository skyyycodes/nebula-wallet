import React, { useState, useEffect } from 'react';
import type { AccountData } from '../hooks/useWallet';

interface HeaderProps {
  currentAccount: AccountData | null;
  accounts: AccountData[];
  onSwitchAccount: (accountId: string) => void;
  onCreateAccount: () => void;
  onCopyAddress: () => void;
  onLock?: () => void;
  onCustomize?: () => void;
  onOpenWallets?: () => void;
  onRefresh?: () => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Check if we're running in a side panel
function isInSidePanel(): boolean {
  // Side panel runs in a larger window context
  // We can detect this by checking window dimensions or URL params
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('mode') === 'sidepanel' || window.innerWidth > 400;
}

// Check if we're running in fullscreen mode
function isInFullscreen(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('mode') === 'fullscreen';
}

export function Header({
  currentAccount,
  accounts,
  onSwitchAccount,
  onCreateAccount,
  onCopyAddress,
  onLock,
  onCustomize,
  onOpenWallets,
  onRefresh,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSidePanel, setIsSidePanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Check if we're in side panel mode
    setIsSidePanel(isInSidePanel());
    // Check if we're in fullscreen mode
    setIsFullscreen(isInFullscreen());
  }, []);

  const handleToggleMode = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.sidePanel) {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (isSidePanel) {
          // Currently in side panel, close popup window (the side panel will stay)
          // Actually, we can't programmatically close side panel from within it
          // But we can close this popup window to let user use popup instead
          window.close();
        } else {
          // Currently in popup, open side panel
          if (tab?.id) {
            await chrome.sidePanel.open({ tabId: tab.id });
            // Close the popup after opening side panel
            window.close();
          }
        }
      }
    } catch (error) {
      console.error('Error toggling panel mode:', error);
    }
  };

  const handleFullscreen = async () => {
    try {
      if (isFullscreen) {
        // Already in fullscreen, close this tab
        window.close();
      } else {
        // Open in a new tab with fullscreen mode
        const popupUrl = chrome.runtime.getURL('popup.html?mode=fullscreen');
        await chrome.tabs.create({ url: popupUrl });
        // Close current popup/sidepanel
        window.close();
      }
    } catch (error) {
      console.error('Error toggling fullscreen mode:', error);
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div
          className="wallet-badge"
          onClick={() => onOpenWallets ? onOpenWallets() : setDropdownOpen(!dropdownOpen)}
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          {currentAccount?.name?.slice(0, 2).toUpperCase() || 'QS'}

          {!onOpenWallets && dropdownOpen && (
            <div className="account-dropdown" onClick={(e) => e.stopPropagation()}>
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`account-item ${account.id === currentAccount?.id ? 'active' : ''}`}
                  onClick={() => {
                    onSwitchAccount(account.id);
                    setDropdownOpen(false);
                  }}
                >
                  <div className="account-item-info">
                    <span className="account-item-name">{account.name}</span>
                    <span className="account-item-address">
                      {truncateAddress(account.address)}
                    </span>
                  </div>
                  <span className={`account-status ${account.isLocked ? 'locked' : 'unlocked'}`}>
                    {account.isLocked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
              ))}
              <div className="add-account-btn" onClick={() => {
                onCreateAccount();
                setDropdownOpen(false);
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create New Account
              </div>
            </div>
          )}
        </div>

        <span className="wallet-name">{currentAccount?.name || 'Nebula'}</span>

        <svg
          className="copy-icon"
          onClick={onCopyAddress}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </div>

      <div className="header-right">
        {/* Customize Background Button */}
        {onCustomize && (
          <svg
            className="header-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            onClick={onCustomize}
            style={{ cursor: 'pointer' }}
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )}
        {/* Refresh Button */}
        {onRefresh && (
          <svg
            className="header-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            onClick={onRefresh}
            style={{ cursor: 'pointer' }}
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        )}
        {onLock && !currentAccount?.isLocked && (
          <svg
            className="header-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            onClick={onLock}
            style={{ cursor: 'pointer' }}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
        {currentAccount?.isLocked && (
          <svg
            className="header-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00d68f"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
        <svg
          className="header-icon expand-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          onClick={handleToggleMode}
          style={{ cursor: 'pointer' }}
        >
          {isSidePanel ? (
            // Collapse/minimize icon when in side panel
            <>
              <path d="M4 14h6v6" />
              <path d="M14 10l-7 7" />
              <path d="M20 10V4h-6" />
              <path d="M14 4l6 6" />
            </>
          ) : (
            // Expand icon when in popup
            <>
              <path d="M15 3h6v6" />
              <path d="M10 14L21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </>
          )}
        </svg>
        {/* Fullscreen Button */}
        <svg
          className="header-icon fullscreen-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          onClick={handleFullscreen}
          style={{ cursor: 'pointer' }}
        >
          {isFullscreen ? (
            // Exit fullscreen icon (minimize/compress)
            <>
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </>
          ) : (
            // Fullscreen icon (expand to corners)
            <>
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </>
          )}
        </svg>
      </div>

      {/* Backdrop to close dropdown */}
      {dropdownOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99,
          }}
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </header>
  );
}
