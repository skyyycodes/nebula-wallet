import React from 'react';

interface ConnectionApprovalProps {
  origin: string;
  siteName: string;
  favicon?: string;
  walletAddress: string;
  onApprove: () => void;
  onReject: () => void;
}

export function ConnectionApproval({
  origin,
  siteName,
  favicon,
  walletAddress,
  onApprove,
  onReject
}: ConnectionApprovalProps) {
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  return (
    <div className="approval-container">
      <div className="approval-header">
        <div className="wallet-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M6 12h12" />
          </svg>
        </div>
        <h1>Connection Request</h1>
      </div>

      <div className="approval-content">
        <div className="site-info">
          <div className="site-icon">
            {favicon ? (
              <img src={favicon} alt={siteName} />
            ) : (
              <div className="site-icon-placeholder">
                {siteName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="site-details">
            <div className="site-name">{siteName}</div>
            <div className="site-origin">{origin}</div>
          </div>
        </div>

        <div className="connection-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>

        <div className="wallet-info">
          <div className="wallet-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M22 10H18a2 2 0 00-2 2v0a2 2 0 002 2h4" />
            </svg>
          </div>
          <div className="wallet-details">
            <div className="wallet-label">Nebula Wallet</div>
            <div className="wallet-address">{truncateAddress(walletAddress)}</div>
          </div>
        </div>

        <div className="permissions-section">
          <h3>This site will be able to:</h3>
          <ul className="permissions-list">
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              View your wallet address
            </li>
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Request transaction signatures
            </li>
          </ul>
        </div>

        <div className="warning-section">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>Only connect to sites you trust</span>
        </div>
      </div>

      <div className="approval-actions">
        <button className="btn-reject" onClick={onReject}>
          Reject
        </button>
        <button className="btn-approve" onClick={onApprove}>
          Connect
        </button>
      </div>
    </div>
  );
}
