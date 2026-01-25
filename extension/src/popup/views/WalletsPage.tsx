import React, { useState } from 'react';
import type { AccountData } from '../hooks/useWallet';

interface WalletsPageProps {
    accounts: AccountData[];
    currentAccount: AccountData | null;
    accountBalances: Record<string, string>; // Map of accountId to balance
    onBack: () => void;
    onSelectAccount: (accountId: string) => void;
    onAddWallet: () => void;
    onRefresh: () => Promise<void>; // Refresh all balances
}

function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Approximate XLM to USD price (in production, fetch from API)
const XLM_USD_PRICE = 0.12;

export function WalletsPage({
    accounts,
    currentAccount,
    accountBalances,
    onBack,
    onSelectAccount,
    onAddWallet,
    onRefresh,
}: WalletsPageProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Calculate total net worth from all accounts
    const totalNetWorth = accounts.reduce((total, account) => {
        const balance = parseFloat(accountBalances[account.id] || '0');
        return total + (balance * XLM_USD_PRICE);
    }, 0);

    // Mock change percentage (in production, calculate from historical data)
    const change = -0.22;

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="wallets-page">
            {/* Header */}
            <div className="wallets-header">
                <button className="wallets-back-btn" onClick={onBack}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="wallets-title">My wallets</h1>
                <button className="wallets-add-btn" onClick={onAddWallet}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* Net Worth Section - Combined total of all wallets */}
            <div className="wallets-net-worth">
                <div className="wallets-net-label-row">
                    <span className="wallets-net-label">NET WORTH</span>
                    <button
                        className={`wallets-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                    </button>
                </div>
                <div className="wallets-net-value">
                    <span className="wallets-net-amount">${totalNetWorth.toFixed(2)}</span>
                    <span className={`wallets-net-change ${change >= 0 ? 'positive' : 'negative'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Recovery Phrase Section */}
            <div className="wallets-section">
                <span className="wallets-section-label">RECOVERY PHRASE</span>
                <div className="wallets-list">
                    {accounts.map((account) => {
                        const accountBalance = parseFloat(accountBalances[account.id] || '0');
                        const accountUsdValue = accountBalance * XLM_USD_PRICE;

                        return (
                            <button
                                key={account.id}
                                className={`wallet-item ${currentAccount?.id === account.id ? 'active' : ''}`}
                                onClick={() => onSelectAccount(account.id)}
                            >
                                <div className="wallet-item-avatar">
                                    {getInitials(account.name)}
                                </div>
                                <div className="wallet-item-info">
                                    <span className="wallet-item-name">{account.name}</span>
                                    <span className="wallet-item-address">
                                        {truncateAddress(account.address)}
                                    </span>
                                </div>
                                <span className="wallet-item-balance">
                                    ${accountUsdValue.toFixed(2)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
