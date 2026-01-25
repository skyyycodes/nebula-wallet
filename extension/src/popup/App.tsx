import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BottomNav, ViewType } from './components/BottomNav';
import { BackgroundPicker } from './components/BackgroundPicker';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { TradingChart } from './components/TradingChart';
import { Home } from './views/Home';
import { Swap } from './views/Swap';
import { Activity } from './views/Activity';
import { Settings } from './views/Settings';
import { Spending } from './views/Spending';
import { ReceivePage } from './views/ReceivePage';
import { SendPage } from './views/SendPage';
import { TokenDetail } from './views/TokenDetail';
import { WalletsPage } from './views/WalletsPage';
import { AgentBuilder } from './views/AgentBuilder';
import { X402 } from './views/X402';
import { Indicator } from './views/Indicator';
import { useWallet } from './hooks/useWallet';
import { useBackground } from './hooks/useBackground';

// Token detail state interface
interface TokenDetailState {
  code: string;
  issuer: string;
}

function CreateWalletView({ onCreateWallet, isLoading }: { onCreateWallet: () => void; isLoading: boolean }) {
  return (
    <div className="create-wallet-view">
      <img
        src="icons/nebula_purple.png"
        alt="Nebula"
        className="create-wallet-logo"
        style={{ width: '80px', height: '80px', marginBottom: '16px' }}
      />
      <h2 className="create-wallet-title">Nebula</h2>
      <p className="create-wallet-description">
        Create a quantum-safe wallet using SPHINCS+ post-quantum signatures. Even if quantum computers break Ed25519, your funds remain secure.
      </p>
      <button
        className="btn-primary"
        onClick={onCreateWallet}
        disabled={isLoading}
      >
        {isLoading ? 'Creating...' : 'Create Wallet'}
      </button>
      <div className="quantum-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        SPHINCS+ Post-Quantum Security
      </div>
    </div>
  );
}

export function App() {
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendPage, setShowSendPage] = useState(false);
  const [showWalletsPage, setShowWalletsPage] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [tokenDetailState, setTokenDetailState] = useState<TokenDetailState | null>(null);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [isMainnet, setIsMainnet] = useState(false);

  const {
    hasWallet,
    currentAccount,
    accounts,
    balance,
    accountBalances,
    isLoading,
    toast,
    createWallet,
    switchAccount,
    deleteAccount,
    airdrop,
    lockWallet,
    sendXLM,
    refreshBalance,
    copyAddress,
    loadWallet,
  } = useWallet();

  const {
    currentBackground,
    customImages,
    setBackground,
    addCustomImage,
    removeCustomImage,
  } = useBackground();

  // Check for fullscreen mode and apply body class
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isFullscreen = urlParams.get('mode') === 'fullscreen';

    setIsFullscreenMode(isFullscreen);

    if (isFullscreen) {
      document.body.classList.add('fullscreen-mode');
    } else {
      document.body.classList.remove('fullscreen-mode');
    }

    return () => {
      document.body.classList.remove('fullscreen-mode');
    };
  }, []);

  // Fetch network state on mount and when view changes (to catch Settings changes)
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_NETWORK' }, (response) => {
      if (response?.success) {
        setIsMainnet(response.data.network === 'mainnet');
      }
    });
  }, [activeView]);

  const handleReceive = () => {
    setShowReceiveModal(true);
  };

  const handleLockClick = () => {
    if (!currentAccount?.isLocked) {
      setShowLockModal(true);
    }
  };

  const handleLockConfirm = async () => {
    setIsLocking(true);
    await lockWallet();
    setIsLocking(false);
    setShowLockModal(false);
  };

  const handleOpenTokenDetail = (code: string, issuer: string) => {
    setTokenDetailState({ code, issuer });
  };

  const handleCloseTokenDetail = () => {
    setTokenDetailState(null);
  };

  // Show loading state
  if (isLoading && !hasWallet) {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  // Show create wallet view if no wallet exists
  if (!hasWallet) {
    return (
      <div className="app">
        <CreateWalletView onCreateWallet={createWallet} isLoading={isLoading} />
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return (
          <Home
            currentAccount={currentAccount}
            balance={balance}
            onReceive={handleReceive}
            onAirdrop={airdrop}
            onLock={lockWallet}
            onOpenSend={() => setShowSendPage(true)}
            onRefresh={refreshBalance}
            onOpenTokenDetail={handleOpenTokenDetail}
            onSwap={() => setActiveView('swap')}
            isMainnet={isMainnet}
          />
        );
      case 'swap':
        return <Swap balance={balance} publicKey={currentAccount?.address} />;
      case 'activity':
        return <Activity />;
      case 'settings':
        return (
          <Settings
            currentAccount={currentAccount}
            onDeleteAccount={deleteAccount}
          />
        );
      case 'spending':
        return <Spending />;
      case 'agent-builder':
        return <AgentBuilder />;
      case 'x402':
        return <X402 />;
      case 'indicator':
        return <Indicator />;
      default:
        return null;
    }
  };

  // Show token detail view if a token is selected
  if (tokenDetailState && currentAccount) {
    return (
      <div className="app">
        <TokenDetail
          code={tokenDetailState.code}
          issuer={tokenDetailState.issuer}
          publicKey={currentAccount.address}
          onBack={handleCloseTokenDetail}
          onSend={() => {
            handleCloseTokenDetail();
            setShowSendPage(true);
          }}
          onReceive={() => {
            handleCloseTokenDetail();
            setShowReceiveModal(true);
          }}
          onSwap={() => {
            handleCloseTokenDetail();
            setActiveView('swap');
          }}
        />
      </div>
    );
  }

  // Fullscreen three-column layout
  if (isFullscreenMode) {
    return (
      <div className={`app fullscreen-layout ${activeView === 'agent-builder' ? 'no-right-sidebar' : ''}`}>
        <LeftSidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="main-content">
          <div className="main-header">
            <h1 className="page-title">
              {activeView === 'home' ? 'Portfolio' : activeView === 'agent-builder' ? 'Agent Builder' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
            </h1>
            <Header
              currentAccount={currentAccount}
              accounts={accounts}
              onSwitchAccount={switchAccount}
              onCreateAccount={createWallet}
              onCopyAddress={copyAddress}
              onLock={handleLockClick}
              onOpenWallets={() => setShowWalletsPage(true)}
              onRefresh={refreshBalance}
            />
          </div>

          <div className="main-scroll-area">
            {activeView === 'home' ? (
              <Home
                currentAccount={currentAccount}
                balance={balance}
                onReceive={handleReceive}
                onAirdrop={airdrop}
                onLock={lockWallet}
                onOpenSend={() => setShowSendPage(true)}
                onRefresh={refreshBalance}
                onSwap={() => setActiveView('swap')}
                backgroundStyle={currentBackground}
                isFullscreen={true}
                isMainnet={isMainnet}
              />
            ) : activeView === 'swap' ? (
              <div className="trade-view">
                <TradingChart />
              </div>
            ) : activeView === 'agent-builder' ? (
              <AgentBuilder />
            ) : (
              renderView()
            )}
          </div>
        </main>

        {activeView !== 'agent-builder' && (
          <RightSidebar balance={balance} publicKey={currentAccount?.address} onSwap={() => setActiveView('swap')} />
        )}

        {/* Toast Notifications */}
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        )}

        {/* Receive Page */}
        {showReceiveModal && currentAccount && (
          <div className="receive-overlay">
            <ReceivePage
              currentAccount={currentAccount}
              onBack={() => setShowReceiveModal(false)}
              onCopyAddress={() => {
                copyAddress();
              }}
            />
          </div>
        )}

        {/* Send Page */}
        {showSendPage && currentAccount && (
          <div className="send-overlay">
            <SendPage
              currentAccount={currentAccount}
              balance={balance}
              onBack={() => setShowSendPage(false)}
              onSend={async (to, amount) => {
                const success = await sendXLM(to, amount);
                if (success) {
                  setShowSendPage(false);
                }
                return success;
              }}
            />
          </div>
        )}

        {/* Wallets Page */}
        {showWalletsPage && (
          <WalletsPage
            accounts={accounts}
            currentAccount={currentAccount}
            accountBalances={accountBalances}
            onBack={() => setShowWalletsPage(false)}
            onSelectAccount={(id) => {
              switchAccount(id);
              setShowWalletsPage(false);
            }}
            onAddWallet={createWallet}
            onRefresh={async () => {
              await loadWallet();
            }}
          />
        )}

        {/* Lock Confirmation Modal */}
        {showLockModal && (
          <div className="modal-overlay" onClick={() => setShowLockModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Lock Wallet</h3>
              <p className="modal-description">
                This will permanently lock your wallet with quantum security.
                <br /><br />
                After locking:<br />
                • Ed25519 private key can NEVER sign transactions<br />
                • Only SPHINCS+ signed preAuthTx can move funds<br />
                • This is IRREVERSIBLE
              </p>
              <div className="modal-actions">
                <button
                  className="modal-btn cancel"
                  onClick={() => setShowLockModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn confirm"
                  onClick={handleLockConfirm}
                  disabled={isLocking}
                >
                  {isLocking ? 'Locking...' : 'Lock Wallet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Background Picker Modal */}
        <BackgroundPicker
          isOpen={showBackgroundPicker}
          onClose={() => setShowBackgroundPicker(false)}
          currentBackground={currentBackground}
          customImages={customImages}
          onApply={setBackground}
          onUploadImage={addCustomImage}
          onRemoveImage={removeCustomImage}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {activeView === 'home' ? (
        <Home
          currentAccount={currentAccount}
          balance={balance}
          onReceive={handleReceive}
          onAirdrop={airdrop}
          onLock={lockWallet}
          onOpenSend={() => setShowSendPage(true)}
          onRefresh={refreshBalance}
          onOpenTokenDetail={handleOpenTokenDetail}
          onSwap={() => setActiveView('swap')}
          backgroundStyle={currentBackground}
          isMainnet={isMainnet}
          headerComponent={
            <Header
              currentAccount={currentAccount}
              accounts={accounts}
              onSwitchAccount={switchAccount}
              onCreateAccount={createWallet}
              onCopyAddress={copyAddress}
              onLock={handleLockClick}
              onCustomize={() => setShowBackgroundPicker(true)}
              onOpenWallets={() => setShowWalletsPage(true)}
              onRefresh={refreshBalance}
            />
          }
        />
      ) : (
        <div className="page-container">
          {renderView()}
        </div>
      )}

      <BottomNav activeView={activeView} onViewChange={setActiveView} />

      {/* Toast Notifications */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Receive Page */}
      {showReceiveModal && currentAccount && (
        <div className="receive-overlay">
          <ReceivePage
            currentAccount={currentAccount}
            onBack={() => setShowReceiveModal(false)}
            onCopyAddress={() => {
              copyAddress();
            }}
          />
        </div>
      )}

      {/* Send Page */}
      {showSendPage && currentAccount && (
        <div className="send-overlay">
          <SendPage
            currentAccount={currentAccount}
            balance={balance}
            onBack={() => setShowSendPage(false)}
            onSend={async (to, amount) => {
              const success = await sendXLM(to, amount);
              if (success) {
                setShowSendPage(false);
              }
              return success;
            }}
          />
        </div>
      )}

      {/* Wallets Page */}
      {showWalletsPage && (
        <WalletsPage
          accounts={accounts}
          currentAccount={currentAccount}
          accountBalances={accountBalances}
          onBack={() => setShowWalletsPage(false)}
          onSelectAccount={(id) => {
            switchAccount(id);
            setShowWalletsPage(false);
          }}
          onAddWallet={createWallet}
          onRefresh={async () => {
            await loadWallet();
          }}
        />
      )}

      {/* Lock Confirmation Modal */}
      {showLockModal && (
        <div className="modal-overlay" onClick={() => setShowLockModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Lock Wallet</h3>
            <p className="modal-description">
              This will permanently lock your wallet with quantum security.
              <br /><br />
              After locking:<br />
              • Ed25519 private key can NEVER sign transactions<br />
              • Only SPHINCS+ signed preAuthTx can move funds<br />
              • This is IRREVERSIBLE
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => setShowLockModal(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={handleLockConfirm}
                disabled={isLocking}
              >
                {isLocking ? 'Locking...' : 'Lock Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Picker Modal */}
      <BackgroundPicker
        isOpen={showBackgroundPicker}
        onClose={() => setShowBackgroundPicker(false)}
        currentBackground={currentBackground}
        customImages={customImages}
        onApply={setBackground}
        onUploadImage={addCustomImage}
        onRemoveImage={removeCustomImage}
      />
    </div>
  );
}
