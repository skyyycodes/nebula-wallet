import React from 'react';

interface TransactionApprovalProps {
  origin: string;
  siteName: string;
  favicon?: string;
  walletAddress: string;
  destination: string;
  amount: string;
  token: string;
  onApprove: () => void;
  onReject: () => void;
}

export function TransactionApproval({
  origin,
  siteName,
  favicon,
  walletAddress,
  destination,
  amount,
  token,
  onApprove,
  onReject
}: TransactionApprovalProps) {
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  // Check if it's a swap transaction (contains arrow or SWAP keyword)
  const isSwapTransaction = token?.includes('→') || token?.includes('SWAP') || amount?.includes('→');
  
  // Parse swap details
  let displayAmount = amount;
  let displayToken = token;
  
  if (isSwapTransaction) {
    // Already formatted as swap
    displayAmount = amount;
    displayToken = token;
  }

  // Determine if destination is self (swap back to wallet)
  const isSelfTransaction = destination?.toLowerCase().includes('self') || 
                            destination?.toLowerCase().includes('swap') ||
                            destination === walletAddress;

  return (
    <div className="approval-container">
      <div className="approval-header">
        <div className="wallet-logo warning">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1>{isSwapTransaction ? 'Swap Request' : 'Transaction Request'}</h1>
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

        <div className="transaction-details">
          <h3>{isSwapTransaction ? 'Swap Details' : 'Transaction Details'}</h3>

          <div className="tx-row">
            <span className="tx-label">From:</span>
            <span className="tx-value">{truncateAddress(walletAddress)}</span>
          </div>

          <div className="tx-row">
            <span className="tx-label">To:</span>
            <span className="tx-value">
              {isSelfTransaction ? 'Self (Swap)' : truncateAddress(destination)}
            </span>
          </div>

          <div className="tx-row amount-row">
            <span className="tx-label">{isSwapTransaction ? 'Swap:' : 'Amount:'}</span>
            <span className="tx-value amount">{displayAmount} {displayToken}</span>
          </div>
        </div>

        <div className="warning-section critical">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {isSwapTransaction 
              ? 'This will swap tokens in your wallet. Make sure you trust this site.'
              : 'This will transfer funds from your wallet. Make sure you trust this site.'}
          </span>
        </div>
      </div>

      <div className="approval-actions">
        <button className="btn-reject" onClick={onReject}>
          Reject
        </button>
        <button className="btn-approve warning" onClick={onApprove}>
          {isSwapTransaction ? 'Confirm Swap' : 'Confirm & Sign'}
        </button>
      </div>
    </div>
  );
}
