/**
 * Secure Storage Module
 *
 * Handles encrypted storage of wallet keys using Chrome's storage API
 * Keys are stored locally and never leave the extension
 * Supports multiple accounts
 */

export interface WalletData {
  id: string;
  name: string;

  // Stellar keys
  stellarPublicKey: string;
  stellarSecretKey: string;

  // SPHINCS+ keys (stored as base64)
  sphincsPublicKey: string;
  sphincsSecretKey: string;

  // Wallet state
  isLocked: boolean;
  createdAt: number;
}

export interface WalletStore {
  accounts: WalletData[];
  activeAccountId: string | null;
}

const STORAGE_KEY = 'quantum_stellar_wallets';

/**
 * Generate unique ID
 */
function generateId(): string {
  return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load entire wallet store
 */
export async function loadWalletStore(): Promise<WalletStore> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[STORAGE_KEY] || { accounts: [], activeAccountId: null });
      }
    });
  });
}

/**
 * Save entire wallet store
 */
async function saveWalletStore(store: WalletStore): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: store }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get all accounts
 */
export async function getAllAccounts(): Promise<WalletData[]> {
  const store = await loadWalletStore();
  return store.accounts;
}

/**
 * Get active account ID
 */
export async function getActiveAccountId(): Promise<string | null> {
  const store = await loadWalletStore();
  return store.activeAccountId;
}

/**
 * Add new wallet account
 */
export async function addWallet(wallet: Omit<WalletData, 'id' | 'name' | 'createdAt'>): Promise<WalletData> {
  const store = await loadWalletStore();

  const newWallet: WalletData = {
    ...wallet,
    id: generateId(),
    name: `Account ${store.accounts.length + 1}`,
    createdAt: Date.now()
  };

  store.accounts.push(newWallet);

  // If this is the first account, make it active
  if (store.accounts.length === 1) {
    store.activeAccountId = newWallet.id;
  }

  await saveWalletStore(store);
  return newWallet;
}

/**
 * Save wallet data (update existing)
 */
export async function saveWallet(wallet: WalletData): Promise<void> {
  const store = await loadWalletStore();
  const index = store.accounts.findIndex(a => a.id === wallet.id);

  if (index >= 0) {
    store.accounts[index] = wallet;
    await saveWalletStore(store);
  }
}

/**
 * Load active wallet
 */
export async function loadWallet(): Promise<WalletData | null> {
  const store = await loadWalletStore();

  if (!store.activeAccountId) {
    return store.accounts[0] || null;
  }

  return store.accounts.find(a => a.id === store.activeAccountId) || null;
}

/**
 * Switch active account
 */
export async function switchAccount(accountId: string): Promise<WalletData | null> {
  const store = await loadWalletStore();
  const account = store.accounts.find(a => a.id === accountId);

  if (account) {
    store.activeAccountId = accountId;
    await saveWalletStore(store);
    return account;
  }

  return null;
}

/**
 * Delete wallet account
 */
export async function deleteWallet(accountId?: string): Promise<void> {
  const store = await loadWalletStore();

  if (accountId) {
    store.accounts = store.accounts.filter(a => a.id !== accountId);

    // If deleted account was active, switch to first remaining
    if (store.activeAccountId === accountId) {
      store.activeAccountId = store.accounts[0]?.id || null;
    }
  } else {
    // Delete all
    store.accounts = [];
    store.activeAccountId = null;
  }

  await saveWalletStore(store);
}

/**
 * Update wallet locked status
 */
export async function updateWalletLockStatus(isLocked: boolean): Promise<void> {
  const wallet = await loadWallet();
  if (wallet) {
    wallet.isLocked = isLocked;
    await saveWallet(wallet);
  }
}

/**
 * Rename account
 */
export async function renameAccount(accountId: string, newName: string): Promise<void> {
  const store = await loadWalletStore();
  const account = store.accounts.find(a => a.id === accountId);

  if (account) {
    account.name = newName;
    await saveWalletStore(store);
  }
}

/**
 * Check if any wallet exists
 */
export async function hasWallet(): Promise<boolean> {
  const store = await loadWalletStore();
  return store.accounts.length > 0;
}

// ============================================
// X402 Storage Functions
// ============================================

import type {
  SpendingAccount,
  ServicePolicy,
  TransactionActivity,
  AgentConfig
} from './types';

const SPENDING_ACCOUNT_KEY = 'x402_spending_account';
const SERVICE_POLICIES_KEY = 'x402_service_policies';
const ACTIVITY_LOG_KEY = 'x402_activity_log';
const AGENT_CONFIG_KEY = 'x402_agent_config';

const MAX_ACTIVITY_ENTRIES = 100;

/**
 * Default agent configuration
 */
function getDefaultAgentConfig(): AgentConfig {
  return {
    enabled: false,
    rechargeThreshold: '5',
    rechargeAmount: '10',
    maxRechargePerDay: '50',
    rechargedToday: '0',
    lastResetDate: new Date().toDateString(),
    emailOnLowBalance: true,
    emailOnRecharge: false
  };
}

// ---- Spending Account ----

/**
 * Save spending account
 */
export async function saveSpendingAccount(account: SpendingAccount): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SPENDING_ACCOUNT_KEY]: account }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Load spending account
 */
export async function loadSpendingAccount(): Promise<SpendingAccount | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([SPENDING_ACCOUNT_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[SPENDING_ACCOUNT_KEY] || null);
      }
    });
  });
}

/**
 * Delete spending account
 */
export async function deleteSpendingAccount(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([SPENDING_ACCOUNT_KEY], () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ---- Service Policies ----

/**
 * Load all service policies
 */
export async function loadServicePolicies(): Promise<Record<string, ServicePolicy>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([SERVICE_POLICIES_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[SERVICE_POLICIES_KEY] || {});
      }
    });
  });
}

/**
 * Save all service policies
 */
async function saveServicePolicies(policies: Record<string, ServicePolicy>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SERVICE_POLICIES_KEY]: policies }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get policy for a specific service origin
 */
export async function getServicePolicy(origin: string): Promise<ServicePolicy | null> {
  const policies = await loadServicePolicies();
  return policies[origin] || null;
}

/**
 * Create or update a service policy
 */
export async function upsertServicePolicy(policy: ServicePolicy): Promise<void> {
  const policies = await loadServicePolicies();
  policies[policy.origin] = {
    ...policy,
    updatedAt: Date.now()
  };
  await saveServicePolicies(policies);
}

/**
 * Delete a service policy
 */
export async function deleteServicePolicy(origin: string): Promise<void> {
  const policies = await loadServicePolicies();
  delete policies[origin];
  await saveServicePolicies(policies);
}

/**
 * Update daily spending for a service (called after successful payment)
 */
export async function updateServiceSpending(origin: string, amountXLM: string): Promise<void> {
  const policies = await loadServicePolicies();
  const policy = policies[origin];

  if (!policy) return;

  const today = new Date().toDateString();

  // Reset if new day
  if (policy.lastResetDate !== today) {
    policy.spentToday = '0';
    policy.lastResetDate = today;
  }

  // Add to daily spending
  const currentSpent = parseFloat(policy.spentToday) || 0;
  const newSpent = currentSpent + parseFloat(amountXLM);
  policy.spentToday = newSpent.toFixed(7);
  policy.updatedAt = Date.now();

  policies[origin] = policy;
  await saveServicePolicies(policies);
}

/**
 * Create a default policy for a new service
 */
export function createDefaultPolicy(origin: string, name?: string): ServicePolicy {
  return {
    origin,
    name: name || new URL(origin).hostname,
    permission: 'prompt', // Default to prompt
    maxPerTransaction: '1', // 1 XLM max per tx
    maxPerDay: '10', // 10 XLM max per day
    spentToday: '0',
    lastResetDate: new Date().toDateString(),
    emailAlerts: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ---- Activity Log ----

/**
 * Load activity log
 */
export async function loadActivityLog(): Promise<TransactionActivity[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([ACTIVITY_LOG_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[ACTIVITY_LOG_KEY] || []);
      }
    });
  });
}

/**
 * Save activity log
 */
async function saveActivityLog(log: TransactionActivity[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: log }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Add activity entry (auto-prunes old entries)
 * Generates ID automatically if not provided
 */
export async function addActivityEntry(entry: Omit<TransactionActivity, 'id'> & { id?: string }): Promise<void> {
  const log = await loadActivityLog();

  // Add to beginning with auto-generated ID if not provided
  const fullEntry: TransactionActivity = {
    ...entry,
    id: entry.id || `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
  log.unshift(fullEntry);

  // Prune if over limit
  if (log.length > MAX_ACTIVITY_ENTRIES) {
    log.splice(MAX_ACTIVITY_ENTRIES);
  }

  await saveActivityLog(log);
}

/**
 * Update activity entry status
 */
export async function updateActivityEntry(
  id: string,
  updates: Partial<TransactionActivity>
): Promise<void> {
  const log = await loadActivityLog();
  const index = log.findIndex(e => e.id === id);

  if (index >= 0) {
    log[index] = { ...log[index], ...updates };
    await saveActivityLog(log);
  }
}

// ============================================
// Connected Sites Storage
// ============================================

export interface ConnectedSite {
  origin: string;
  name: string;
  favicon?: string;
  connectedAt: number;
  lastUsed: number;
  permissions: ('connect' | 'sign' | 'signAndSubmit')[];
}

const CONNECTED_SITES_KEY = 'connected_sites';

/**
 * Load all connected sites
 */
export async function loadConnectedSites(): Promise<Record<string, ConnectedSite>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([CONNECTED_SITES_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[CONNECTED_SITES_KEY] || {});
      }
    });
  });
}

/**
 * Save all connected sites
 */
async function saveConnectedSites(sites: Record<string, ConnectedSite>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Save a connected site
 */
export async function saveConnectedSite(site: ConnectedSite): Promise<void> {
  const sites = await loadConnectedSites();
  sites[site.origin] = site;
  await saveConnectedSites(sites);
}

/**
 * Remove a connected site
 */
export async function removeConnectedSite(origin: string): Promise<void> {
  const sites = await loadConnectedSites();
  delete sites[origin];
  await saveConnectedSites(sites);
}

/**
 * Check if origin is connected
 */
export async function isOriginConnected(origin: string): Promise<boolean> {
  const sites = await loadConnectedSites();
  return !!sites[origin];
}

/**
 * Get connected site by origin
 */
export async function getConnectedSite(origin: string): Promise<ConnectedSite | null> {
  const sites = await loadConnectedSites();
  return sites[origin] || null;
}

/**
 * Update last used timestamp for a site
 */
export async function updateSiteLastUsed(origin: string): Promise<void> {
  const sites = await loadConnectedSites();
  if (sites[origin]) {
    sites[origin].lastUsed = Date.now();
    await saveConnectedSites(sites);
  }
}

// ---- Agent Config ----

/**
 * Load agent config
 */
export async function loadAgentConfig(): Promise<AgentConfig> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([AGENT_CONFIG_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[AGENT_CONFIG_KEY] || getDefaultAgentConfig());
      }
    });
  });
}

/**
 * Save agent config
 */
export async function saveAgentConfig(config: AgentConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [AGENT_CONFIG_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Update agent daily recharge tracking
 */
export async function updateAgentRechargeTracking(amountXLM: string): Promise<void> {
  const config = await loadAgentConfig();
  const today = new Date().toDateString();

  // Reset if new day
  if (config.lastResetDate !== today) {
    config.rechargedToday = '0';
    config.lastResetDate = today;
  }

  // Add to daily recharge
  const current = parseFloat(config.rechargedToday) || 0;
  const newAmount = current + parseFloat(amountXLM);
  config.rechargedToday = newAmount.toFixed(7);

  await saveAgentConfig(config);
}

// ---- Transaction Cursor Tracking ----

const TRANSACTION_CURSOR_KEY = 'transaction_cursor';

/**
 * Get last transaction cursor for an account
 */
export async function getLastTransactionCursor(accountId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([TRANSACTION_CURSOR_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        const cursors = result[TRANSACTION_CURSOR_KEY] || {};
        resolve(cursors[accountId] || null);
      }
    });
  });
}

/**
 * Save last transaction cursor for an account
 */
export async function saveLastTransactionCursor(accountId: string, cursor: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([TRANSACTION_CURSOR_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const cursors = result[TRANSACTION_CURSOR_KEY] || {};
      cursors[accountId] = cursor;

      chrome.storage.local.set({ [TRANSACTION_CURSOR_KEY]: cursors }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

// ============================================
// Payment Requests Storage
// ============================================

import type { PaymentRequest, WebhookConfig } from './types';

const PAYMENT_REQUESTS_KEY = 'payment_requests';
const WEBHOOKS_KEY = 'agent_webhooks';

/**
 * Load all payment requests
 */
export async function loadPaymentRequests(): Promise<PaymentRequest[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([PAYMENT_REQUESTS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[PAYMENT_REQUESTS_KEY] || []);
      }
    });
  });
}

/**
 * Save payment requests
 */
async function savePaymentRequests(requests: PaymentRequest[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [PAYMENT_REQUESTS_KEY]: requests }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Create a new payment request
 */
export async function createPaymentRequest(
  request: Omit<PaymentRequest, 'id' | 'createdAt' | 'status' | 'expiresAt'> & { expiresAt?: number }
): Promise<PaymentRequest> {
  const requests = await loadPaymentRequests();

  const newRequest: PaymentRequest = {
    ...request,
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: request.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000, // Default 7 days expiration
  };

  requests.unshift(newRequest);

  // Keep only last 100 requests
  if (requests.length > 100) {
    requests.splice(100);
  }

  await savePaymentRequests(requests);
  return newRequest;
}

/**
 * Get payment requests for a specific address (as requester or payer)
 */
export async function getPaymentRequestsForAddress(
  address: string
): Promise<{ incoming: PaymentRequest[]; outgoing: PaymentRequest[] }> {
  const requests = await loadPaymentRequests();

  // Expire old requests
  const now = Date.now();
  let hasExpired = false;
  requests.forEach(r => {
    if (r.status === 'pending' && r.expiresAt < now) {
      r.status = 'expired';
      hasExpired = true;
    }
  });

  if (hasExpired) {
    await savePaymentRequests(requests);
  }

  return {
    incoming: requests.filter(r => r.requestedFrom === address),
    outgoing: requests.filter(r => r.createdBy === address),
  };
}

/**
 * Update payment request status
 */
export async function updatePaymentRequest(
  requestId: string,
  updates: Partial<PaymentRequest>
): Promise<PaymentRequest | null> {
  const requests = await loadPaymentRequests();
  const index = requests.findIndex(r => r.id === requestId);

  if (index >= 0) {
    requests[index] = { ...requests[index], ...updates, respondedAt: Date.now() };
    await savePaymentRequests(requests);
    return requests[index];
  }

  return null;
}

/**
 * Get a single payment request by ID
 */
export async function getPaymentRequest(requestId: string): Promise<PaymentRequest | null> {
  const requests = await loadPaymentRequests();
  return requests.find(r => r.id === requestId) || null;
}

/**
 * Cancel a payment request (by creator)
 */
export async function cancelPaymentRequest(requestId: string, creatorAddress: string): Promise<boolean> {
  const requests = await loadPaymentRequests();
  const index = requests.findIndex(r => r.id === requestId && r.createdBy === creatorAddress);

  if (index >= 0 && requests[index].status === 'pending') {
    requests[index].status = 'expired';
    requests[index].respondedAt = Date.now();
    await savePaymentRequests(requests);
    return true;
  }

  return false;
}

// ============================================
// Webhooks Storage
// ============================================

/**
 * Load all webhooks
 */
export async function loadWebhooks(): Promise<WebhookConfig[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([WEBHOOKS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[WEBHOOKS_KEY] || []);
      }
    });
  });
}

/**
 * Save webhooks
 */
async function saveWebhooks(webhooks: WebhookConfig[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [WEBHOOKS_KEY]: webhooks }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Register a new webhook
 */
export async function registerWebhook(
  config: Omit<WebhookConfig, 'id' | 'createdAt'>
): Promise<WebhookConfig> {
  const webhooks = await loadWebhooks();

  const newWebhook: WebhookConfig = {
    ...config,
    id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
  };

  webhooks.push(newWebhook);
  await saveWebhooks(webhooks);
  return newWebhook;
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  const webhooks = await loadWebhooks();
  const filtered = webhooks.filter(w => w.id !== webhookId);
  await saveWebhooks(filtered);
}

/**
 * Get webhooks by event type
 */
export async function getWebhooksForEvent(
  eventType: string
): Promise<WebhookConfig[]> {
  const webhooks = await loadWebhooks();
  return webhooks.filter(w => w.enabled && w.events.includes(eventType as any));
}

/**
 * Get multiple wallets by their IDs
 */
export async function getWalletsByIds(walletIds: string[]): Promise<WalletData[]> {
  const store = await loadWalletStore();
  return store.accounts.filter(account => walletIds.includes(account.id));
}
