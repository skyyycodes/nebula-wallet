/**
 * Network Configuration Constants
 * Centralized configuration for all supported Stellar networks
 */

import { NetworkConfig, NetworkType } from './types';

/**
 * Stellar Testnet Configuration
 * Used for development, testing, and X402 simulations
 */
export const TESTNET_CONFIG: NetworkConfig = {
  type: NetworkType.TESTNET,
  name: 'Stellar Testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
  defaultBaseFee: 100,
  maxFee: 100000, // 0.01 XLM max
  friendbotUrl: 'https://friendbot.stellar.org',
  explorerUrl: 'https://stellar.expert/explorer/testnet',
  isTestNetwork: true,
};

/**
 * Stellar Mainnet Configuration
 * Used for production with real assets
 */
export const MAINNET_CONFIG: NetworkConfig = {
  type: NetworkType.MAINNET,
  name: 'Stellar Mainnet',
  horizonUrl: 'https://horizon.stellar.org',
  sorobanRpcUrl: 'https://soroban.stellar.org',
  passphrase: 'Public Global Stellar Network ; September 2015',
  defaultBaseFee: 100,
  maxFee: 500000, // 0.05 XLM max for mainnet surge pricing
  friendbotUrl: null,
  explorerUrl: 'https://stellar.expert/explorer/public',
  isTestNetwork: false,
};

/**
 * Map of all available network configurations
 */
export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  [NetworkType.TESTNET]: TESTNET_CONFIG,
  [NetworkType.MAINNET]: MAINNET_CONFIG,
};

/**
 * Default network for new installations
 */
export const DEFAULT_NETWORK = NetworkType.TESTNET;

/**
 * Storage key for persisting network preference
 */
export const NETWORK_STORAGE_KEY = 'stellar_network_preference';
