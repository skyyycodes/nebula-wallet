import 'dotenv/config';

export const CONFIG = {
  RELAYER_SECRET: process.env.RELAYER_SECRET || '',
  CONTRACT_ID: process.env.CONTRACT_ID || 'CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW',
  NETWORK: process.env.NETWORK || 'testnet',
  SOROBAN_RPC_URL: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443',
  HORIZON_URL: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  POLL_INTERVAL_MS: 5000,  // Poll every 5 seconds
  APPROVAL_TIMEOUT_MS: 300000,  // 5 minutes
};

export function validateConfig() {
  if (!CONFIG.RELAYER_SECRET) {
    throw new Error('RELAYER_SECRET environment variable is required');
  }
  if (!CONFIG.CONTRACT_ID) {
    throw new Error('CONTRACT_ID environment variable is required');
  }
}
