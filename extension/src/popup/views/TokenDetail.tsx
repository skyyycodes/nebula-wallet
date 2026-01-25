/**
 * Token Detail View
 * 
 * Comprehensive view for a single Stellar token showing:
 * - Token name, symbol, icon
 * - Current price with 24h change
 * - Interactive price chart
 * - User's position (balance + USD value)
 * - Market info (market cap, supply, volume)
 * - Transaction activity
 */

import React, { useEffect, useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { TokenActivity } from '../components/TokenActivity';
import {
  tokenService,
  TokenInfo,
  TokenPrice,
  MarketInfo,
  POPULAR_STELLAR_ASSETS,
} from '../services/token-service';

interface TokenDetailProps {
  code: string;
  issuer: string;
  publicKey: string;
  onBack: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onSwap?: () => void;
}

export function TokenDetail({ code, issuer, publicKey, onBack, onSend, onReceive, onSwap }: TokenDetailProps) {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [price, setPrice] = useState<TokenPrice | null>(null);
  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setIsLoading(true);
      try {
        // Fetch all data in parallel
        const [info, priceData, market, bal] = await Promise.all([
          tokenService.getTokenInfo(code, issuer),
          tokenService.getTokenPrice(code, issuer),
          tokenService.getMarketInfo(code, issuer),
          tokenService.getTokenBalance(publicKey, code, issuer),
        ]);

        if (isMounted) {
          setTokenInfo(info);
          setPrice(priceData);
          setMarketInfo(market);
          setBalance(bal);
        }
      } catch (error) {
        console.error('Failed to fetch token data:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    // Refresh price every 30 seconds
    const interval = setInterval(async () => {
      const priceData = await tokenService.getTokenPrice(code, issuer);
      if (isMounted && priceData) {
        setPrice(priceData);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [code, issuer, publicKey]);

  // Get popular asset info for icon
  const popularAsset = POPULAR_STELLAR_ASSETS.find(
    (a) => a.code === code && a.issuer === issuer
  );

  // Calculate USD value
  const balanceNum = parseFloat(balance) || 0;
  const usdValue = price ? balanceNum * price.usd : 0;

  // Format large numbers
  function formatLargeNumber(num: number): string {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  }

  function formatSupply(num: number): string {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  }

  if (isLoading) {
    return (
      <div className="token-detail-view">
        <div className="token-detail-header">
          <button className="back-button" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="token-detail-title">{code}</span>
          <div className="header-spacer" />
        </div>
        <div className="token-detail-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="token-detail-view">
      {/* Header */}
      <div className="token-detail-header">
        <button className="back-button" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="token-detail-title-row">
          <span className="token-detail-title">{tokenInfo?.name || code}</span>
          {tokenInfo?.verified && (
            <svg className="verified-badge" width="16" height="16" viewBox="0 0 24 24" fill="#667eea">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="header-spacer" />
      </div>

      {/* Scrollable content */}
      <div className="token-detail-content">
        {/* Price Display */}
        <div className="price-section">
          <span className="current-price">
            ${price?.usd?.toFixed(price.usd < 1 ? 4 : 2) || '0.00'}
          </span>
          {price && (
            <span className={`price-change-badge ${price.usdChange24h >= 0 ? 'positive' : 'negative'}`}>
              {price.usdChange24h >= 0 ? '+' : ''}
              ${Math.abs(price.usdChange24h * (price.usd / 100)).toFixed(2)}{' '}
              <span className="change-percent">
                {price.usdChange24h >= 0 ? '+' : ''}
                {price.usdChange24h.toFixed(2)}%
              </span>
            </span>
          )}
        </div>

        {/* Price Chart */}
        <PriceChart
          code={code}
          issuer={issuer}
          currentPrice={price?.usd}
          priceChange={price?.usdChange24h}
        />

        {/* Action Buttons */}
        <div className="token-actions">
          <button className="token-action-btn" onClick={onSend}>
            <div className="action-icon-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
            <span>Send</span>
          </button>
          <button className="token-action-btn" onClick={onReceive}>
            <div className="action-icon-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 7h.01M7 12h.01M7 17h.01M12 7h.01M12 12h.01M12 17h.01M17 7h.01M17 12h.01M17 17h.01" />
              </svg>
            </div>
            <span>Receive</span>
          </button>
          <button className="token-action-btn" onClick={onSwap}>
            <div className="action-icon-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>
            <span>Swap</span>
          </button>
          <button className="token-action-btn">
            <div className="action-icon-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </div>
            <span>More</span>
          </button>
        </div>

        {/* Your Position */}
        <div className="position-section">
          <h3 className="section-title">Your Position</h3>
          <div className="position-cards">
            <div className="position-card">
              <span className="position-label">Balance</span>
              <span className="position-value">{balanceNum.toFixed(5)}</span>
            </div>
            <div className="position-card">
              <span className="position-label">Value</span>
              <span className="position-value">${usdValue.toFixed(2)}</span>
            </div>
          </div>
          <div className="position-return">
            <span className="return-label">24h Return</span>
            <span className={`return-value ${(price?.usdChange24h || 0) >= 0 ? 'positive' : 'negative'}`}>
              {price?.usdChange24h && price.usdChange24h >= 0 ? '+' : ''}
              {price?.usdChange24h
                ? `$${Math.abs(usdValue * (price.usdChange24h / 100)).toFixed(2)}`
                : '+<$0.01'}
            </span>
          </div>
        </div>

        {/* Your Stake */}
        {(code === 'XLM' || code === 'yXLM') && (
          <div className="stake-section">
            <h3 className="section-title">Your Stake</h3>
            <div className="stake-card">
              <div className="stake-info">
                <span className="stake-label">Stake with Nebula</span>
                <span className="stake-apy">Earn <span className="apy-value">5%</span> per year</span>
              </div>
              <svg className="stake-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        )}

        {/* Market Info */}
        <div className="info-section">
          <h3 className="section-title">Info</h3>
          <div className="info-list">
            <div className="info-row">
              <span className="info-label">Name</span>
              <span className="info-value">{tokenInfo?.name || code}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Symbol</span>
              <span className="info-value">{code}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Network</span>
              <span className="info-value">Stellar</span>
            </div>
            {marketInfo && (
              <>
                <div className="info-row">
                  <span className="info-label">Market Cap</span>
                  <span className="info-value">{formatLargeNumber(marketInfo.marketCap)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total Supply</span>
                  <span className="info-value">{formatSupply(marketInfo.totalSupply)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Circulating Supply</span>
                  <span className="info-value">{formatSupply(marketInfo.circulatingSupply)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* About Section */}
        {tokenInfo?.description && (
          <div className="about-section">
            <h3 className="section-title">About</h3>
            <p className="about-text">{tokenInfo.description}</p>
            {tokenInfo.domain && (
              <a
                href={`https://${tokenInfo.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="website-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Website
              </a>
            )}
          </div>
        )}

        {/* 24h Performance */}
        {marketInfo && (
          <div className="performance-section">
            <h3 className="section-title">24h Performance</h3>
            <div className="performance-cards">
              <div className="performance-card">
                <span className="perf-label">Volume</span>
                <span className="perf-value">
                  {formatLargeNumber(marketInfo.volume24h)}
                  {marketInfo.volumeChange24h && (
                    <span className={`perf-change ${marketInfo.volumeChange24h >= 0 ? 'positive' : 'negative'}`}>
                      {marketInfo.volumeChange24h >= 0 ? '+' : ''}
                      {marketInfo.volumeChange24h.toFixed(2)}%
                    </span>
                  )}
                </span>
              </div>
              {marketInfo.holders && (
                <div className="performance-card">
                  <span className="perf-label">Holders</span>
                  <span className="perf-value">{formatSupply(marketInfo.holders)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity */}
        <TokenActivity publicKey={publicKey} code={code} issuer={issuer} />
      </div>
    </div>
  );
}
