/**
 * Account Service
 * Handles account operations: balance fetching, account info, minimum balance calculation
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from '../network';
import { AccountInfo, AssetBalance } from './types';

// Base reserve constants
const BASE_RESERVE = 0.5; // XLM
const MIN_ACCOUNT_BALANCE = 1; // 2 * BASE_RESERVE

export class AccountService {
  private static instance: AccountService | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AccountService {
    if (!AccountService.instance) {
      AccountService.instance = new AccountService();
    }
    return AccountService.instance;
  }

  /**
   * Get full account information including all balances
   */
  async getAccountInfo(publicKey: string): Promise<AccountInfo> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    try {
      const account = await server.loadAccount(publicKey);
      return this.parseAccountResponse(publicKey, account);
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Account doesn't exist yet
        return this.getEmptyAccountInfo(publicKey);
      }
      throw new Error(`Failed to load account: ${error.message}`);
    }
  }

  /**
   * Get all balances for an account
   */
  async getBalances(publicKey: string): Promise<AssetBalance[]> {
    const accountInfo = await this.getAccountInfo(publicKey);
    return accountInfo.balances;
  }

  /**
   * Get native XLM balance
   */
  async getXlmBalance(publicKey: string): Promise<AssetBalance | null> {
    const balances = await this.getBalances(publicKey);
    return balances.find(b => b.assetType === 'native') || null;
  }

  /**
   * Get balance for a specific asset
   */
  async getAssetBalance(
    publicKey: string,
    assetCode: string,
    assetIssuer?: string
  ): Promise<AssetBalance | null> {
    const balances = await this.getBalances(publicKey);
    
    if (assetCode === 'XLM' && !assetIssuer) {
      return balances.find(b => b.assetType === 'native') || null;
    }

    return balances.find(
      b => b.assetCode === assetCode && b.assetIssuer === assetIssuer
    ) || null;
  }

  /**
   * Check if account exists on the network
   */
  async accountExists(publicKey: string): Promise<boolean> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();

    try {
      await server.loadAccount(publicKey);
      return true;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if account has trustline for an asset
   */
  async hasTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string
  ): Promise<boolean> {
    const balance = await this.getAssetBalance(publicKey, assetCode, assetIssuer);
    return balance !== null;
  }

  /**
   * Calculate minimum required balance based on subentries
   */
  calculateMinimumBalance(subentryCount: number): string {
    // Minimum balance = (2 + subentries) * base_reserve
    const minBalance = (2 + subentryCount) * BASE_RESERVE;
    return minBalance.toFixed(7);
  }

  /**
   * Calculate available XLM (total - minimum - selling liabilities)
   */
  calculateAvailableXlm(
    totalXlm: string,
    minimumBalance: string,
    sellingLiabilities: string
  ): string {
    const total = parseFloat(totalXlm);
    const min = parseFloat(minimumBalance);
    const liabilities = parseFloat(sellingLiabilities);
    
    const available = total - min - liabilities;
    return Math.max(0, available).toFixed(7);
  }

  /**
   * Get account sequence number for transaction building
   */
  async getSequenceNumber(publicKey: string): Promise<string> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    
    const account = await server.loadAccount(publicKey);
    return account.sequence;
  }

  /**
   * Load account for transaction building
   */
  async loadAccount(publicKey: string): Promise<StellarSdk.Account> {
    const networkManager = getNetworkManager();
    const server = networkManager.getServer();
    
    return await server.loadAccount(publicKey);
  }

  // Private methods

  private parseAccountResponse(
    publicKey: string,
    account: StellarSdk.Horizon.AccountResponse
  ): AccountInfo {
    const balances = this.parseBalances(account.balances);
    const nativeBalance = balances.find(b => b.assetType === 'native');
    const minimumBalance = this.calculateMinimumBalance(account.subentry_count);

    return {
      publicKey,
      sequence: account.sequence,
      balances,
      subentryCount: account.subentry_count,
      minimumBalance,
      availableXlm: this.calculateAvailableXlm(
        nativeBalance?.balance || '0',
        minimumBalance,
        nativeBalance?.sellingLiabilities || '0'
      ),
      isActive: true,
      thresholds: {
        lowThreshold: account.thresholds.low_threshold,
        medThreshold: account.thresholds.med_threshold,
        highThreshold: account.thresholds.high_threshold,
      },
      flags: {
        authRequired: account.flags.auth_required,
        authRevocable: account.flags.auth_revocable,
        authImmutable: account.flags.auth_immutable,
        authClawbackEnabled: account.flags.auth_clawback_enabled,
      },
      homeDomain: account.home_domain || null,
      inflationDestination: account.inflation_destination || null,
      lastModifiedLedger: account.last_modified_ledger,
      sponsor: (account as any).sponsor || null,
      numSponsored: (account as any).num_sponsored || 0,
      numSponsoring: (account as any).num_sponsoring || 0,
    };
  }

  private parseBalances(
    balances: StellarSdk.Horizon.HorizonApi.BalanceLine[]
  ): AssetBalance[] {
    return balances.map(balance => {
      const isNative = balance.asset_type === 'native';
      
      // Type guards for different balance types
      const assetCode = isNative 
        ? 'XLM' 
        : 'asset_code' in balance 
          ? balance.asset_code 
          : 'LP';
      
      const assetIssuer = isNative 
        ? null 
        : 'asset_issuer' in balance 
          ? balance.asset_issuer 
          : null;

      const limit = isNative 
        ? null 
        : 'limit' in balance 
          ? balance.limit 
          : null;

      const isAuthorized = 'is_authorized' in balance 
        ? balance.is_authorized 
        : true;

      const balanceNum = parseFloat(balance.balance);
      const sellingLiab = parseFloat((balance as any).selling_liabilities || '0');

      return {
        assetType: balance.asset_type,
        assetCode,
        assetIssuer,
        balance: balance.balance,
        balanceNumber: balanceNum,
        buyingLiabilities: (balance as any).buying_liabilities || '0',
        sellingLiabilities: (balance as any).selling_liabilities || '0',
        availableBalance: (balanceNum - sellingLiab).toFixed(7),
        limit,
        isAuthorized,
        sponsor: (balance as any).sponsor || null,
      };
    });
  }

  private getEmptyAccountInfo(publicKey: string): AccountInfo {
    return {
      publicKey,
      sequence: '0',
      balances: [{
        assetType: 'native',
        assetCode: 'XLM',
        assetIssuer: null,
        balance: '0',
        balanceNumber: 0,
        buyingLiabilities: '0',
        sellingLiabilities: '0',
        availableBalance: '0',
        limit: null,
        isAuthorized: true,
        sponsor: null,
      }],
      subentryCount: 0,
      minimumBalance: MIN_ACCOUNT_BALANCE.toFixed(7),
      availableXlm: '0',
      isActive: false,
      thresholds: {
        lowThreshold: 0,
        medThreshold: 0,
        highThreshold: 0,
      },
      flags: {
        authRequired: false,
        authRevocable: false,
        authImmutable: false,
        authClawbackEnabled: false,
      },
      homeDomain: null,
      inflationDestination: null,
      lastModifiedLedger: 0,
      sponsor: null,
      numSponsored: 0,
      numSponsoring: 0,
    };
  }
}

// Export singleton getter
export const getAccountService = () => AccountService.getInstance();
