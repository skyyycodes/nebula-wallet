'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Interface for Quantum Stellar Wallet Provider
 */
interface QuantumStellarProvider {
  isQuantumStellar: boolean;
  version: string;
  isConnected(): boolean;
  getAddress(): string | null;
  connect(): Promise<{ address: string }>;
  disconnect(): Promise<void>;
  getAccounts(): Promise<string[]>;
  checkConnection(): Promise<{ connected: boolean; address: string | null }>;
  getBalance(): Promise<string>;
  sendXLM(to: string, amount: string): Promise<{ txHash: string }>;
  on(event: string, callback: (data: unknown) => void): void;
  off(event: string, callback: (data: unknown) => void): void;
}

declare global {
  interface Window {
    quantumStellar?: QuantumStellarProvider;
  }
}

interface UseQuantumWalletReturn {
  /** Whether the extension is installed */
  isInstalled: boolean;
  /** Whether the wallet is connected to this site */
  isConnected: boolean;
  /** The connected wallet address (null if not connected) */
  address: string | null;
  /** Loading state during connection operations */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Connect to the wallet */
  connect: () => Promise<void>;
  /** Disconnect from the wallet */
  disconnect: () => Promise<void>;
  /** Get wallet balance (requires connection) */
  getBalance: () => Promise<string | null>;
  /** The raw provider instance */
  provider: QuantumStellarProvider | null;
}

/**
 * React hook for interacting with Quantum Stellar Wallet
 *
 * @example
 * ```tsx
 * const { isConnected, address, connect, disconnect } = useQuantumWallet();
 *
 * return (
 *   <button onClick={isConnected ? disconnect : connect}>
 *     {isConnected ? `Connected: ${address}` : 'Connect Wallet'}
 *   </button>
 * );
 * ```
 */
export function useQuantumWallet(): UseQuantumWalletReturn {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<QuantumStellarProvider | null>(null);

  // Check if extension is installed and set up event listeners
  useEffect(() => {
    const checkExtension = () => {
      if (typeof window !== 'undefined' && window.quantumStellar) {
        setIsInstalled(true);
        setProvider(window.quantumStellar);

        // Check existing connection
        window.quantumStellar.checkConnection().then(({ connected, address: addr }) => {
          setIsConnected(connected);
          setAddress(addr);
        });

        // Set up event listeners
        const handleConnect = (data: unknown) => {
          const { address: addr } = data as { address: string };
          setIsConnected(true);
          setAddress(addr);
        };

        const handleDisconnect = () => {
          setIsConnected(false);
          setAddress(null);
        };

        const handleAccountsChanged = (data: unknown) => {
          const accounts = data as string[];
          if (accounts.length === 0) {
            setIsConnected(false);
            setAddress(null);
          } else {
            setIsConnected(true);
            setAddress(accounts[0]);
          }
        };

        window.quantumStellar.on('connect', handleConnect);
        window.quantumStellar.on('disconnect', handleDisconnect);
        window.quantumStellar.on('accountsChanged', handleAccountsChanged);

        // Cleanup
        return () => {
          if (window.quantumStellar) {
            window.quantumStellar.off('connect', handleConnect);
            window.quantumStellar.off('disconnect', handleDisconnect);
            window.quantumStellar.off('accountsChanged', handleAccountsChanged);
          }
        };
      }
    };

    // Check immediately
    checkExtension();

    // Also listen for the ready event (in case extension loads after component)
    const handleReady = () => {
      checkExtension();
    };

    window.addEventListener('quantumStellarReady', handleReady);

    return () => {
      window.removeEventListener('quantumStellarReady', handleReady);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!window.quantumStellar) {
      setError('Quantum Stellar Wallet extension is not installed');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { address: addr } = await window.quantumStellar.connect();
      setIsConnected(true);
      setAddress(addr);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!window.quantumStellar) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await window.quantumStellar.disconnect();
      setIsConnected(false);
      setAddress(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getBalance = useCallback(async (): Promise<string | null> => {
    if (!window.quantumStellar || !isConnected) {
      return null;
    }

    try {
      return await window.quantumStellar.getBalance();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get balance';
      setError(message);
      return null;
    }
  }, [isConnected]);

  return {
    isInstalled,
    isConnected,
    address,
    isLoading,
    error,
    connect,
    disconnect,
    getBalance,
    provider,
  };
}

export default useQuantumWallet;
