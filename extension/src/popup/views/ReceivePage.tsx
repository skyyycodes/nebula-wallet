import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { AccountData } from '../hooks/useWallet';

interface ReceivePageProps {
    currentAccount: AccountData;
    onBack: () => void;
    onCopyAddress: () => void;
}

function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ReceivePage({ currentAccount, onBack, onCopyAddress }: ReceivePageProps) {
    return (
        <div className="receive-page">
            {/* Header */}
            <div className="receive-header">
                <button className="receive-back" onClick={onBack}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                </button>
                <h2 className="receive-title">Receive</h2>
            </div>

            {/* QR Card */}
            <div className="receive-qr-card">
                <div className="receive-qr-container">
                    <QRCodeSVG
                        value={currentAccount.address}
                        size={220}
                        level="H"
                        includeMargin={true}
                        bgColor="#ffffff"
                        fgColor="#000000"
                    />
                </div>

                {/* Wallet Info */}
                <div className="receive-wallet-info">
                    <div className="receive-wallet-details">
                        <span className="receive-wallet-name">{currentAccount.name || 'Main Wallet'}</span>
                        <span className="receive-wallet-address">{truncateAddress(currentAccount.address)}</span>
                    </div>
                    <div className="receive-network-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="#fff" strokeWidth="1.5" fill="none" />
                            <path d="M12 22V12" stroke="#fff" strokeWidth="1.5" />
                            <path d="M22 7L12 12 2 7" stroke="#fff" strokeWidth="1.5" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Warning Text */}
            <p className="receive-warning">
                Only send Stellar Network tokens (XLM) to this address
            </p>

            {/* Copy Button */}
            <button className="receive-copy-btn" onClick={onCopyAddress}>
                Copy address
            </button>
        </div>
    );
}
