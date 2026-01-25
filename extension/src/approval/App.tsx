import React, { useEffect, useState } from 'react';
import { ConnectionApproval } from './ConnectionApproval';
import { TransactionApproval } from './TransactionApproval';

interface ApprovalRequest {
  type: 'connect' | 'transaction';
  origin: string;
  siteName: string;
  favicon?: string;
  requestId: string;
  // Transaction specific fields
  destination?: string;
  amount?: string;
  token?: string;
}

export function ApprovalApp() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Parse URL parameters to get request details
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    const type = params.get('type') as 'connect' | 'transaction';
    const origin = params.get('origin');
    const siteName = params.get('siteName');
    const favicon = params.get('favicon') || undefined;

    // Transaction specific params
    const destination = params.get('destination') || undefined;
    const amount = params.get('amount') || undefined;
    const token = params.get('token') || undefined;

    if (requestId && type && origin && siteName) {
      setRequest({
        type,
        origin,
        siteName,
        favicon,
        requestId,
        destination,
        amount,
        token
      });
    }

    // Get wallet address
    chrome.runtime.sendMessage({ type: 'GET_WALLET' }, (response) => {
      if (response?.success && response.data?.address) {
        setWalletAddress(response.data.address);
      }
      setLoading(false);
    });
  }, []);

  const handleApprove = () => {
    if (!request) return;

    // Send approval to background
    chrome.runtime.sendMessage({
      type: 'APPROVAL_RESPONSE',
      payload: {
        requestId: request.requestId,
        approved: true
      }
    }, () => {
      window.close();
    });
  };

  const handleReject = () => {
    if (!request) return;

    // Send rejection to background
    chrome.runtime.sendMessage({
      type: 'APPROVAL_RESPONSE',
      payload: {
        requestId: request.requestId,
        approved: false
      }
    }, () => {
      window.close();
    });
  };

  if (loading) {
    return (
      <div className="approval-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="approval-container">
        <div className="error">Invalid request</div>
      </div>
    );
  }

  if (request.type === 'connect') {
    return (
      <ConnectionApproval
        origin={request.origin}
        siteName={request.siteName}
        favicon={request.favicon}
        walletAddress={walletAddress}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    );
  }

  if (request.type === 'transaction') {
    return (
      <TransactionApproval
        origin={request.origin}
        siteName={request.siteName}
        favicon={request.favicon}
        walletAddress={walletAddress}
        destination={request.destination || ''}
        amount={request.amount || '0'}
        token={request.token || 'XLM'}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    );
  }

  return (
    <div className="approval-container">
      <div className="error">Unknown request type</div>
    </div>
  );
}
