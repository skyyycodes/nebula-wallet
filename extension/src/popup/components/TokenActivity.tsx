/**
 * Token Activity Component
 * 
 * Displays transaction history for a specific token
 * Shows sent/received/swapped transactions with counterparty info
 */

import React, { useEffect, useState } from 'react';
import { tokenService, TokenTransaction } from '../services/token-service';

interface TokenActivityProps {
  publicKey: string;
  code: string;
  issuer: string;
}

export function TokenActivity({ publicKey, code, issuer }: TokenActivityProps) {
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchTransactions() {
      setIsLoading(true);
      try {
        const txs = await tokenService.getTokenTransactions(publicKey, code, issuer);
        if (isMounted) {
          setTransactions(txs);
        }
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (publicKey) {
      fetchTransactions();
    }

    return () => {
      isMounted = false;
    };
  }, [publicKey, code, issuer]);

  // Truncate address for display
  function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  // Format timestamp
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 hour
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / (60 * 1000));
      return `${mins}m ago`;
    }

    // Less than 24 hours
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}h ago`;
    }

    // Less than 7 days
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}d ago`;
    }

    // Otherwise show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Format amount
  function formatAmount(amount: string, type: string): string {
    const num = parseFloat(amount);
    const prefix = type === 'received' ? '+' : '-';
    return `${prefix}${num.toFixed(4)}`;
  }

  const displayTransactions = showAll ? transactions : transactions.slice(0, 3);

  if (isLoading) {
    return (
      <div className="token-activity">
        <div className="activity-header">
          <h3 className="activity-title">Activity</h3>
        </div>
        <div className="activity-loading">
          <div className="loading-spinner small" />
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="token-activity">
        <div className="activity-header">
          <h3 className="activity-title">Activity</h3>
        </div>
        <div className="activity-empty">
          <p>No transactions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="token-activity">
      <div className="activity-header">
        <h3 className="activity-title">Activity</h3>
        {transactions.length > 3 && (
          <button className="activity-see-more" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show Less' : 'See More'}
          </button>
        )}
      </div>

      <div className="activity-list">
        {displayTransactions.map((tx) => (
          <div key={tx.id} className="activity-item">
            <div className="activity-icon-wrapper">
              <div className={`activity-icon ${tx.type}`}>
                {tx.type === 'received' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                ) : tx.type === 'sent' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                )}
              </div>
            </div>

            <div className="activity-details">
              <span className="activity-type">
                {tx.type === 'received' ? 'Received' : tx.type === 'sent' ? 'Sent' : 'Swapped'}
              </span>
              <span className="activity-counterparty">
                {tx.type === 'received' ? 'From' : 'To'} {truncateAddress(tx.counterparty)}
              </span>
            </div>

            <div className="activity-amount-section">
              <span className={`activity-amount ${tx.type}`}>
                {formatAmount(tx.amount, tx.type)} {tx.asset}
              </span>
              <span className="activity-time">{formatTime(tx.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="activity-disclaimer">
        Past performance is not an indicator of future performance.
      </p>
    </div>
  );
}
