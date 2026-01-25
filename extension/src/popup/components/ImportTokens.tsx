/**
 * Import Tokens Modal
 * 
 * Allows users to search and import Stellar tokens
 * with tabs for Search and Custom Token input
 */

import React, { useState, useEffect, useCallback } from 'react';
import { tokenService, POPULAR_STELLAR_ASSETS, TokenInfo } from '../services/token-service';

interface ImportTokensProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (code: string, issuer: string) => void;
  importedTokens: Array<{ code: string; issuer: string }>;
}

type TabType = 'search' | 'custom';

export function ImportTokens({ isOpen, onClose, onImport, importedTokens }: ImportTokensProps) {
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TokenInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customIssuer, setCustomIssuer] = useState('');
  const [customError, setCustomError] = useState('');

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await tokenService.searchTokens(searchQuery, 10);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleImportToken = useCallback((code: string, issuer: string) => {
    onImport(code, issuer);
  }, [onImport]);

  const handleCustomImport = useCallback(() => {
    setCustomError('');

    if (!customCode.trim()) {
      setCustomError('Token code is required');
      return;
    }

    if (!customIssuer.trim()) {
      setCustomError('Issuer address is required');
      return;
    }

    // Validate issuer format (Stellar public key)
    if (!customIssuer.startsWith('G') || customIssuer.length !== 56) {
      setCustomError('Invalid issuer address format');
      return;
    }

    onImport(customCode.toUpperCase(), customIssuer);
    setCustomCode('');
    setCustomIssuer('');
  }, [customCode, customIssuer, onImport]);

  const isTokenImported = useCallback((code: string, issuer: string) => {
    return importedTokens.some(t => t.code === code && t.issuer === issuer);
  }, [importedTokens]);

  if (!isOpen) return null;

  // Filter popular tokens not yet imported
  const suggestedTokens = POPULAR_STELLAR_ASSETS.filter(
    token => !isTokenImported(token.code, token.issuer)
  ).slice(0, 5);

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="import-modal-header">
          <h2 className="import-modal-title">Import Tokens</h2>
          <button className="import-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="import-tabs">
          <button
            className={`import-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
          <button
            className={`import-tab ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            Custom token
          </button>
        </div>

        {/* Content */}
        <div className="import-content">
          {activeTab === 'search' ? (
            <>
              {/* Search Input */}
              <div className="import-search-wrapper">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="import-search-input"
                  placeholder="Search tokens"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Search Results or Suggestions */}
              <div className="import-token-list">
                {isSearching ? (
                  <div className="import-loading">
                    <div className="loading-spinner small" />
                    <span>Searching...</span>
                  </div>
                ) : searchQuery ? (
                  searchResults.length > 0 ? (
                    searchResults.map((token) => (
                      <div key={`${token.code}-${token.issuer}`} className="import-token-item">
                        <div className="import-token-icon">
                          {token.icon || token.code.charAt(0)}
                        </div>
                        <div className="import-token-info">
                          <span className="import-token-name">{token.name}</span>
                          <span className="import-token-code">{token.code}</span>
                        </div>
                        <button
                          className={`import-token-btn ${isTokenImported(token.code, token.issuer) ? 'imported' : ''}`}
                          onClick={() => handleImportToken(token.code, token.issuer)}
                          disabled={isTokenImported(token.code, token.issuer)}
                        >
                          {isTokenImported(token.code, token.issuer) ? 'Added' : 'Import'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="import-empty">
                      <p>No tokens found for "{searchQuery}"</p>
                      <p className="import-empty-hint">Try searching by token code or name</p>
                    </div>
                  )
                ) : (
                  <>
                    {suggestedTokens.length > 0 && (
                      <>
                        <div className="import-section-title">Popular tokens</div>
                        {suggestedTokens.map((token) => (
                          <div key={`${token.code}-${token.issuer}`} className="import-token-item">
                            <div className="import-token-icon">
                              {token.icon || token.code.charAt(0)}
                            </div>
                            <div className="import-token-info">
                              <span className="import-token-name">{token.name}</span>
                              <span className="import-token-code">{token.code}</span>
                            </div>
                            <button
                              className="import-token-btn"
                              onClick={() => handleImportToken(token.code, token.issuer)}
                            >
                              Import
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="import-info-box">
                      <div className="import-info-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="12" cy="10" r="2" />
                          <circle cx="8" cy="14" r="1" />
                          <circle cx="16" cy="14" r="1" />
                        </svg>
                      </div>
                      <p>Add Stellar tokens you've acquired to your wallet</p>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* Custom Token Tab */
            <div className="import-custom-form">
              <div className="import-form-group">
                <label className="import-label">Token Code</label>
                <input
                  type="text"
                  className="import-input"
                  placeholder="e.g., USDC"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  maxLength={12}
                />
              </div>

              <div className="import-form-group">
                <label className="import-label">Issuer Address</label>
                <input
                  type="text"
                  className="import-input"
                  placeholder="G..."
                  value={customIssuer}
                  onChange={(e) => setCustomIssuer(e.target.value)}
                />
                <span className="import-hint">The Stellar address that issued this token</span>
              </div>

              {customError && (
                <div className="import-error">{customError}</div>
              )}

              <button
                className="import-submit-btn"
                onClick={handleCustomImport}
                disabled={!customCode || !customIssuer}
              >
                Import Token
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
