/**
 * Network Manager
 * Handles network switching, connection management, and fee estimation
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  NetworkConfig,
  NetworkType,
  NetworkState,
  FeeStats,
} from './types';
import {
  NETWORK_CONFIGS,
  DEFAULT_NETWORK,
  NETWORK_STORAGE_KEY,
} from './config';

type NetworkChangeListener = (network: NetworkConfig) => void;

export class NetworkManager {
  private static instance: NetworkManager | null = null;
  private currentNetwork: NetworkType;
  private server: StellarSdk.Horizon.Server | null = null;
  private listeners: Set<NetworkChangeListener> = new Set();
  private state: NetworkState;
  private feeStatsCache: FeeStats | null = null;
  private readonly FEE_CACHE_TTL_MS = 30000; // 30 seconds

  private constructor() {
    this.currentNetwork = DEFAULT_NETWORK;
    this.state = {
      current: DEFAULT_NETWORK,
      isConnected: false,
      lastConnectedAt: null,
      latencyMs: null,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  /**
   * Initialize network manager with persisted preference
   */
  async initialize(): Promise<void> {
    try {
      // Load persisted network preference
      const stored = await this.loadNetworkPreference();
      if (stored && NETWORK_CONFIGS[stored]) {
        this.currentNetwork = stored;
        this.state.current = stored;
      }

      // Initialize Horizon server
      this.initializeServer();

      // Test connection
      await this.testConnection();

      console.log(`[NetworkManager] Initialized on ${this.currentNetwork}`);
    } catch (error) {
      console.error('[NetworkManager] Initialization error:', error);
      // Fall back to testnet on error
      this.currentNetwork = NetworkType.TESTNET;
      this.initializeServer();
    }
  }

  /**
   * Get current network configuration
   */
  getConfig(): NetworkConfig {
    return NETWORK_CONFIGS[this.currentNetwork];
  }

  /**
   * Get current network type
   */
  getNetworkType(): NetworkType {
    return this.currentNetwork;
  }

  /**
   * Get Horizon server instance
   */
  getServer(): StellarSdk.Horizon.Server {
    if (!this.server) {
      this.initializeServer();
    }
    return this.server!;
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return { ...this.state };
  }

  /**
   * Switch to a different network
   * @param network - Target network type
   * @param force - Force switch even if same network
   */
  async switchNetwork(network: NetworkType, force = false): Promise<void> {
    if (this.currentNetwork === network && !force) {
      console.log(`[NetworkManager] Already on ${network}`);
      return;
    }

    const config = NETWORK_CONFIGS[network];
    if (!config) {
      throw new Error(`Unknown network: ${network}`);
    }

    console.log(`[NetworkManager] Switching from ${this.currentNetwork} to ${network}`);

    // Update state
    this.currentNetwork = network;
    this.state.current = network;
    this.state.isConnected = false;
    this.feeStatsCache = null;

    // Reinitialize server
    this.initializeServer();

    // Persist preference
    await this.saveNetworkPreference(network);

    // Test connection
    await this.testConnection();

    // Notify listeners
    this.notifyListeners();

    console.log(`[NetworkManager] Switched to ${network}`);
  }

  /**
   * Test network connectivity
   */
  async testConnection(): Promise<boolean> {
    const config = this.getConfig();
    const startTime = Date.now();

    try {
      const server = this.getServer();
      await server.ledgers().order('desc').limit(1).call();

      this.state.isConnected = true;
      this.state.lastConnectedAt = Date.now();
      this.state.latencyMs = Date.now() - startTime;

      return true;
    } catch (error) {
      console.error('[NetworkManager] Connection test failed:', error);
      this.state.isConnected = false;
      this.state.latencyMs = null;
      return false;
    }
  }

  /**
   * Get current fee statistics from the network
   */
  async getFeeStats(): Promise<FeeStats> {
    // Return cached stats if still valid
    if (
      this.feeStatsCache &&
      Date.now() - this.feeStatsCache.fetchedAt < this.FEE_CACHE_TTL_MS
    ) {
      return this.feeStatsCache;
    }

    const config = this.getConfig();

    try {
      const server = this.getServer();
      const feeStats = await server.feeStats();

      const stats: FeeStats = {
        min: parseInt(feeStats.fee_charged.min, 10),
        average: parseInt(feeStats.fee_charged.mode, 10),
        max: parseInt(feeStats.fee_charged.max, 10),
        recommended: parseInt(feeStats.fee_charged.p70, 10), // 70th percentile
        fetchedAt: Date.now(),
      };

      this.feeStatsCache = stats;
      return stats;
    } catch (error) {
      console.warn('[NetworkManager] Failed to fetch fee stats, using defaults:', error);
      return {
        min: config.defaultBaseFee,
        average: config.defaultBaseFee,
        max: config.maxFee,
        recommended: config.defaultBaseFee,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Get recommended fee for transaction
   * @param operationCount - Number of operations in transaction
   */
  async getRecommendedFee(operationCount = 1): Promise<number> {
    const stats = await this.getFeeStats();
    const config = this.getConfig();

    // Calculate fee with some headroom
    const baseFee = Math.max(stats.recommended, config.defaultBaseFee);
    const totalFee = baseFee * operationCount;

    // Cap at max fee
    return Math.min(totalFee, config.maxFee);
  }

  /**
   * Request testnet funds from friendbot
   * Only works on testnet
   */
  async fundTestnetAccount(publicKey: string): Promise<boolean> {
    const config = this.getConfig();

    if (!config.friendbotUrl) {
      throw new Error('Friendbot not available on this network');
    }

    try {
      const response = await fetch(`${config.friendbotUrl}?addr=${publicKey}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Friendbot error: ${error}`);
      }
      return true;
    } catch (error) {
      console.error('[NetworkManager] Friendbot funding failed:', error);
      throw error;
    }
  }

  /**
   * Subscribe to network changes
   */
  onNetworkChange(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check if current network is testnet
   */
  isTestnet(): boolean {
    return this.currentNetwork === NetworkType.TESTNET;
  }

  /**
   * Check if current network is mainnet
   */
  isMainnet(): boolean {
    return this.currentNetwork === NetworkType.MAINNET;
  }

  // Private methods

  private initializeServer(): void {
    const config = this.getConfig();
    this.server = new StellarSdk.Horizon.Server(config.horizonUrl);
  }

  private notifyListeners(): void {
    const config = this.getConfig();
    this.listeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('[NetworkManager] Listener error:', error);
      }
    });
  }

  private async loadNetworkPreference(): Promise<NetworkType | null> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(NETWORK_STORAGE_KEY);
        return result[NETWORK_STORAGE_KEY] || null;
      }
      // Fallback to localStorage for non-extension contexts
      const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
      return stored as NetworkType | null;
    } catch {
      return null;
    }
  }

  private async saveNetworkPreference(network: NetworkType): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [NETWORK_STORAGE_KEY]: network });
      } else {
        localStorage.setItem(NETWORK_STORAGE_KEY, network);
      }
    } catch (error) {
      console.error('[NetworkManager] Failed to save network preference:', error);
    }
  }
}

// Export singleton getter
export const getNetworkManager = () => NetworkManager.getInstance();
