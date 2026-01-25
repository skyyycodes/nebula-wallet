import { useState, useEffect, useCallback } from 'react';
import type { ExtensionResponse } from '../../types';

export interface AccountData {
  id: string;
  name: string;
  address: string;
  isLocked: boolean;
}

interface WalletState {
  hasWallet: boolean;
  currentAccount: AccountData | null;
  accounts: AccountData[];
  balance: string;
  accountBalances: Record<string, string>; // Map of accountId to balance
  isLoading: boolean;
}

async function sendMessage(type: string, payload?: unknown): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    hasWallet: false,
    currentAccount: null,
    accounts: [],
    balance: '0',
    accountBalances: {},
    isLoading: true,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadWallet = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const walletResponse = await sendMessage('GET_WALLET');

      if (walletResponse.success && walletResponse.data) {
        const data = walletResponse.data as AccountData;

        // Get balance
        const balanceResponse = await sendMessage('GET_BALANCE');
        let balance = '0';
        let isLocked = data.isLocked;

        if (balanceResponse.success && balanceResponse.data) {
          const balanceData = balanceResponse.data as { balance: string; isLocked?: boolean };
          balance = balanceData.balance;
          if (balanceData.isLocked !== undefined) {
            isLocked = balanceData.isLocked;
          }
        }

        // Get all accounts
        const accountsResponse = await sendMessage('GET_ACCOUNTS');
        let accounts: AccountData[] = [];

        if (accountsResponse.success && accountsResponse.data) {
          const accountsData = accountsResponse.data as { accounts: AccountData[] };
          accounts = accountsData.accounts;
        }

        // Fetch balance for each account
        const balances: Record<string, string> = {};
        for (const account of accounts) {
          try {
            const accBalanceResponse = await sendMessage('GET_BALANCE_FOR_ACCOUNT', { accountId: account.id });
            if (accBalanceResponse.success && accBalanceResponse.data) {
              const balData = accBalanceResponse.data as { balance: string };
              balances[account.id] = balData.balance;
            } else {
              balances[account.id] = '0';
            }
          } catch {
            balances[account.id] = '0';
          }
        }
        // Ensure current account has the fetched balance
        if (data.id) {
          balances[data.id] = balance;
        }

        setState({
          hasWallet: true,
          currentAccount: { ...data, isLocked },
          accounts,
          balance,
          accountBalances: balances,
          isLoading: false,
        });
      } else {
        setState({
          hasWallet: false,
          currentAccount: null,
          accounts: [],
          balance: '0',
          accountBalances: {},
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Failed to load wallet:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const createWallet = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    const response = await sendMessage('CREATE_WALLET');

    if (response.success && response.data) {
      const data = response.data as AccountData;
      await loadWallet();
      showToast('Wallet created! Fund it with Airdrop.', 'success');
      return true;
    } else {
      showToast(response.error || 'Failed to create wallet', 'error');
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [loadWallet, showToast]);

  const switchAccount = useCallback(async (accountId: string) => {
    if (accountId === state.currentAccount?.id) return;

    const response = await sendMessage('SWITCH_ACCOUNT', { accountId });

    if (response.success && response.data) {
      await loadWallet();
      const data = response.data as AccountData;
      showToast(`Switched to ${data.name}`, 'success');
    } else {
      showToast(response.error || 'Failed to switch account', 'error');
    }
  }, [state.currentAccount?.id, loadWallet, showToast]);

  const deleteAccount = useCallback(async (accountId: string) => {
    const response = await sendMessage('DELETE_ACCOUNT', { accountId });

    if (response.success) {
      await loadWallet();
      showToast('Account deleted', 'success');
      return true;
    } else {
      showToast(response.error || 'Failed to delete account', 'error');
      return false;
    }
  }, [loadWallet, showToast]);

  const airdrop = useCallback(async () => {
    const response = await sendMessage('AIRDROP');

    if (response.success && response.data) {
      const data = response.data as { balance: string; message: string };
      setState(prev => ({ ...prev, balance: data.balance }));
      showToast(data.message, 'success');
      return true;
    } else {
      showToast(response.error || 'Airdrop failed', 'error');
      return false;
    }
  }, [showToast]);

  const lockWallet = useCallback(async () => {
    const response = await sendMessage('LOCK_WALLET');

    if (response.success && response.data) {
      const data = response.data as { hash: string; message: string };
      await loadWallet();
      showToast(data.message, 'success');
      return true;
    } else {
      showToast(response.error || 'Failed to lock wallet', 'error');
      return false;
    }
  }, [loadWallet, showToast]);

  const sendXLM = useCallback(async (to: string, amount: string) => {
    if (!state.currentAccount?.isLocked) {
      showToast('Please lock the wallet first for quantum security', 'error');
      return false;
    }

    const response = await sendMessage('SEND_XLM', { to, amount });

    if (response.success && response.data) {
      const data = response.data as { txHash: string; message: string };
      await loadWallet();
      showToast(`Transaction sent! Hash: ${data.txHash.slice(0, 16)}...`, 'success');
      return true;
    } else {
      showToast(response.error || 'Transaction failed', 'error');
      return false;
    }
  }, [state.currentAccount?.isLocked, loadWallet, showToast]);

  const refreshBalance = useCallback(async () => {
    const response = await sendMessage('GET_BALANCE');

    if (response.success && response.data) {
      const data = response.data as { balance: string; isLocked?: boolean };
      setState(prev => ({
        ...prev,
        balance: data.balance,
        currentAccount: prev.currentAccount ? {
          ...prev.currentAccount,
          isLocked: data.isLocked ?? prev.currentAccount.isLocked
        } : null
      }));
      showToast('Balance refreshed!', 'success');
    } else {
      showToast(response.error || 'Failed to refresh', 'error');
    }
  }, [showToast]);

  const copyAddress = useCallback(async () => {
    if (state.currentAccount?.address) {
      await navigator.clipboard.writeText(state.currentAccount.address);
      showToast('Address copied!', 'success');
    }
  }, [state.currentAccount?.address, showToast]);

  const importWallet = useCallback(async (secretKey: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    const response = await sendMessage('IMPORT_WALLET', { secretKey });

    if (response.success && response.data) {
      await loadWallet();
      showToast('Wallet imported successfully!', 'success');
      return true;
    } else {
      showToast(response.error || 'Failed to import wallet', 'error');
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [loadWallet, showToast]);

  return {
    ...state,
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
    importWallet,
  };
}
