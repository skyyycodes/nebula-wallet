import React, { useState } from 'react';
import type { AccountData } from '../hooks/useWallet';

interface SendPageProps {
    currentAccount: AccountData;
    balance: string;
    onBack: () => void;
    onSend: (to: string, amount: string) => Promise<boolean>;
}

export function SendPage({ currentAccount, balance, onBack, onSend }: SendPageProps) {
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const balanceNum = parseFloat(balance) || 0;
    const amountNum = parseFloat(amount) || 0;
    const usdValue = amountNum * 0.12; // Approximate XLM price

    const handleMax = () => {
        // Leave some for fees
        const maxAmount = Math.max(0, balanceNum - 0.5);
        setAmount(maxAmount.toFixed(7));
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Only allow numbers and decimal point
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setAmount(value);
        }
    };

    const handleSend = async () => {
        if (!recipient || !amount || amountNum <= 0) return;

        setIsLoading(true);
        const success = await onSend(recipient, amount);
        setIsLoading(false);

        if (success) {
            onBack();
        }
    };

    const isValid = recipient.length > 0 && amountNum > 0 && amountNum <= balanceNum && currentAccount.isLocked;

    return (
        <div className="send-page">
            {/* Header */}
            <div className="send-header">
                <button className="send-back" onClick={onBack}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                </button>
                <h2 className="send-title">Send</h2>
            </div>

            {/* Amount Input Section */}
            <div className="send-amount-section">
                <div className="send-amount-row">
                    <div className="send-amount-input-wrapper">
                        <input
                            type="text"
                            className="send-amount-input"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder="0"
                            inputMode="decimal"
                            style={{
                                fontSize: amount.length > 10 ? '28px' :
                                    amount.length > 7 ? '36px' :
                                        amount.length > 5 ? '42px' : '48px'
                            }}
                        />
                        <span className="send-amount-token" style={{
                            fontSize: amount.length > 10 ? '14px' :
                                amount.length > 7 ? '16px' : '20px'
                        }}>XLM</span>
                    </div>
                    <button className="send-max-btn" onClick={handleMax}>
                        Max
                    </button>
                </div>
                <div className="send-amount-info">
                    <span className="send-usd-value">${usdValue.toFixed(2)}</span>
                    <span className="send-available">{balanceNum.toFixed(7)} XLM</span>
                </div>
            </div>

            {/* Token Selector */}
            <div className="send-field">
                <label className="send-field-label">Token</label>
                <div className="send-token-selector">
                    <div className="send-token-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="url(#xlmGradient)" />
                            <defs>
                                <linearGradient id="xlmGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#667eea" />
                                    <stop offset="100%" stopColor="#764ba2" />
                                </linearGradient>
                            </defs>
                            <path d="M8 10h8M8 12h6M8 14h7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="send-token-name">XLM</span>
                </div>
            </div>

            {/* Recipient Input */}
            <div className="send-field">
                <label className="send-field-label">Recipient</label>
                <input
                    type="text"
                    className="send-recipient-input"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Search or paste"
                />
            </div>

            {/* Lock Warning */}
            {!currentAccount.isLocked && (
                <p className="send-warning">
                    ⚠️ Please lock your wallet first for quantum security
                </p>
            )}

            {/* Send Button */}
            <button
                className={`send-submit-btn ${isValid ? 'active' : ''}`}
                onClick={handleSend}
                disabled={!isValid || isLoading}
            >
                {isLoading ? 'Sending...' : 'Send'}
            </button>
        </div>
    );
}
