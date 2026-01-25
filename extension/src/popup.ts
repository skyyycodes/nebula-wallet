/**
 * Popup Script
 *
 * Handles the wallet popup UI interactions
 */

import type { ExtensionResponse } from './types';

// DOM Elements
const noWalletView = document.getElementById('noWalletView')!;
const walletView = document.getElementById('walletView')!;
const statusBadge = document.getElementById('statusBadge')!;
const addressBox = document.getElementById('addressBox')!;
const balanceAmount = document.getElementById('balanceAmount')!;
const messageBox = document.getElementById('messageBox')!;

// Account Switcher Elements
const accountSelector = document.getElementById('accountSelector')!;
const accountDropdown = document.getElementById('accountDropdown')!;
const accountsList = document.getElementById('accountsList')!;
const currentAccountName = document.getElementById('currentAccountName')!;
const currentAccountAddr = document.getElementById('currentAccountAddr')!;
const addAccountBtn = document.getElementById('addAccountBtn')!;

// Buttons
const createWalletBtn = document.getElementById('createWalletBtn') as HTMLButtonElement;
const copyAddressBtn = document.getElementById('copyAddressBtn') as HTMLButtonElement;
const airdropBtn = document.getElementById('airdropBtn') as HTMLButtonElement;
const lockWalletBtn = document.getElementById('lockWalletBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const deleteAccountBtn = document.getElementById('deleteAccountBtn') as HTMLButtonElement;

// Inputs
const destAddressInput = document.getElementById('destAddress') as HTMLInputElement;
const sendAmountInput = document.getElementById('sendAmount') as HTMLInputElement;

// Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// State
let currentAddress = '';
let currentAccountId = '';
let isLocked = false;

interface AccountData {
  id: string;
  name: string;
  address: string;
  isLocked: boolean;
}

/**
 * Send message to background script
 */
async function sendMessage(type: string, payload?: unknown): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

/**
 * Show message to user
 */
function showMessage(text: string, type: 'error' | 'success' | 'info') {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 5000);
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Update account switcher display
 */
function updateAccountSwitcher(name: string, address: string) {
  currentAccountName.textContent = name;
  currentAccountAddr.textContent = truncateAddress(address);
}

/**
 * Update accounts list in dropdown
 */
async function updateAccountsList() {
  const response = await sendMessage('GET_ACCOUNTS');

  if (!response.success || !response.data) return;

  const data = response.data as { accounts: AccountData[]; activeId: string | null };
  const accounts = data.accounts;
  const activeId = data.activeId;

  accountsList.innerHTML = '';

  accounts.forEach(account => {
    const item = document.createElement('div');
    item.className = `account-item${account.id === activeId ? ' active' : ''}`;
    item.innerHTML = `
      <div class="account-item-info">
        <span class="account-item-name">${account.name}</span>
        <span class="account-item-addr">${truncateAddress(account.address)}</span>
      </div>
      <span class="account-item-status ${account.isLocked ? 'locked' : 'unlocked'}">
        ${account.isLocked ? 'Locked' : 'Unlocked'}
      </span>
    `;

    item.addEventListener('click', () => switchToAccount(account.id));
    accountsList.appendChild(item);
  });
}

/**
 * Switch to a different account
 */
async function switchToAccount(accountId: string) {
  if (accountId === currentAccountId) {
    accountDropdown.classList.remove('show');
    return;
  }

  const response = await sendMessage('SWITCH_ACCOUNT', { accountId });

  if (response.success && response.data) {
    const data = response.data as AccountData;
    currentAccountId = data.id;
    currentAddress = data.address;
    isLocked = data.isLocked;

    updateAccountSwitcher(data.name, data.address);
    addressBox.textContent = data.address;

    // Update lock status
    if (isLocked) {
      statusBadge.textContent = 'Quantum Secure';
      statusBadge.className = 'status-badge secure';
      lockWalletBtn.disabled = true;
      lockWalletBtn.textContent = 'Wallet Locked';
    } else {
      statusBadge.textContent = 'Unlocked';
      statusBadge.className = 'status-badge unlocked';
      lockWalletBtn.disabled = false;
      lockWalletBtn.textContent = 'Lock Wallet (Quantum Secure)';
    }

    // Refresh balance
    const balanceResponse = await sendMessage('GET_BALANCE');
    if (balanceResponse.success && balanceResponse.data) {
      const balanceData = balanceResponse.data as { balance: string; isLocked?: boolean };
      balanceAmount.textContent = balanceData.balance;
    } else {
      balanceAmount.textContent = '0';
    }

    await updateAccountsList();
    accountDropdown.classList.remove('show');

    showMessage(`Switched to ${data.name}`, 'success');
  } else {
    showMessage(response.error || 'Failed to switch account', 'error');
  }
}

/**
 * Update UI based on wallet state
 */
function updateUI(hasWallet: boolean, address?: string, balance?: string, locked?: boolean, name?: string, id?: string) {
  if (hasWallet && address) {
    noWalletView.classList.add('hidden');
    walletView.classList.remove('hidden');

    currentAddress = address;
    currentAccountId = id || '';
    addressBox.textContent = address;
    balanceAmount.textContent = balance || '0';
    isLocked = locked || false;

    // Update account switcher
    updateAccountSwitcher(name || 'Account 1', address);

    // Update status badge
    if (locked) {
      statusBadge.textContent = 'Quantum Secure';
      statusBadge.className = 'status-badge secure';
      lockWalletBtn.disabled = true;
      lockWalletBtn.textContent = 'Wallet Locked';
    } else {
      statusBadge.textContent = 'Unlocked';
      statusBadge.className = 'status-badge unlocked';
      lockWalletBtn.disabled = false;
      lockWalletBtn.textContent = 'Lock Wallet (Quantum Secure)';
    }

    // Load accounts list
    updateAccountsList();
  } else {
    noWalletView.classList.remove('hidden');
    walletView.classList.add('hidden');
    statusBadge.textContent = 'No Wallet';
    statusBadge.className = 'status-badge no-wallet';
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(button: HTMLElement, loading: boolean, originalText?: string) {
  if (loading) {
    button.setAttribute('data-original-text', button.textContent || '');
    button.innerHTML = '<span class="loading"></span>Processing...';
    (button as HTMLButtonElement).disabled = true;
  } else {
    button.textContent = originalText || button.getAttribute('data-original-text') || '';
    (button as HTMLButtonElement).disabled = false;
  }
}

/**
 * Initialize popup
 */
async function init() {
  // Check if wallet exists
  const walletResponse = await sendMessage('GET_WALLET');

  if (walletResponse.success && walletResponse.data) {
    const data = walletResponse.data as { id: string; name: string; address: string; isLocked: boolean };

    // Get balance
    const balanceResponse = await sendMessage('GET_BALANCE');
    let balance = '0';
    let locked = data.isLocked;

    if (balanceResponse.success && balanceResponse.data) {
      const balanceData = balanceResponse.data as { balance: string; isLocked?: boolean };
      balance = balanceData.balance;
      if (balanceData.isLocked !== undefined) {
        locked = balanceData.isLocked;
      }
    }

    updateUI(true, data.address, balance, locked, data.name, data.id);
  } else {
    updateUI(false);
  }
}

// Event Listeners

// Account selector toggle
accountSelector.addEventListener('click', (e) => {
  e.stopPropagation();
  accountDropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  accountDropdown.classList.remove('show');
});

// Prevent dropdown from closing when clicking inside
accountDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Add new account
addAccountBtn.addEventListener('click', async () => {
  accountDropdown.classList.remove('show');

  const response = await sendMessage('CREATE_WALLET');

  if (response.success && response.data) {
    const data = response.data as AccountData;
    currentAccountId = data.id;
    currentAddress = data.address;
    isLocked = data.isLocked;

    updateUI(true, data.address, '0', data.isLocked, data.name, data.id);
    showMessage(`Created ${data.name}! Fund it with the Airdrop button.`, 'success');
  } else {
    showMessage(response.error || 'Failed to create account', 'error');
  }
});

createWalletBtn.addEventListener('click', async () => {
  setButtonLoading(createWalletBtn, true);

  const response = await sendMessage('CREATE_WALLET');

  if (response.success && response.data) {
    const data = response.data as AccountData;
    updateUI(true, data.address, '0', data.isLocked, data.name, data.id);
    showMessage('Wallet created! Fund it with the Airdrop button.', 'success');
  } else {
    showMessage(response.error || 'Failed to create wallet', 'error');
  }

  setButtonLoading(createWalletBtn, false, 'Create Quantum Wallet');
});

copyAddressBtn.addEventListener('click', async () => {
  if (currentAddress) {
    await navigator.clipboard.writeText(currentAddress);
    showMessage('Address copied to clipboard!', 'success');
  }
});

airdropBtn.addEventListener('click', async () => {
  setButtonLoading(airdropBtn, true);

  const response = await sendMessage('AIRDROP');

  if (response.success && response.data) {
    const data = response.data as { balance: string; message: string };
    balanceAmount.textContent = data.balance;
    showMessage(data.message, 'success');
  } else {
    showMessage(response.error || 'Airdrop failed', 'error');
  }

  setButtonLoading(airdropBtn, false, 'Airdrop Testnet XLM');
});

lockWalletBtn.addEventListener('click', async () => {
  if (isLocked) return;

  const confirmed = confirm(
    'WARNING: This will permanently lock your wallet!\n\n' +
    'After locking:\n' +
    '• The Ed25519 private key can NEVER sign transactions\n' +
    '• Only SPHINCS+ signed preAuthTx can move funds\n' +
    '• This is IRREVERSIBLE\n\n' +
    'Continue?'
  );

  if (!confirmed) return;

  setButtonLoading(lockWalletBtn, true);

  const response = await sendMessage('LOCK_WALLET');

  if (response.success && response.data) {
    const data = response.data as { hash: string; message: string };
    isLocked = true;
    statusBadge.textContent = 'Quantum Secure';
    statusBadge.className = 'status-badge secure';
    lockWalletBtn.disabled = true;
    lockWalletBtn.textContent = 'Wallet Locked';
    await updateAccountsList();
    showMessage(data.message, 'success');
  } else {
    showMessage(response.error || 'Failed to lock wallet', 'error');
    setButtonLoading(lockWalletBtn, false, 'Lock Wallet (Quantum Secure)');
  }
});

refreshBtn.addEventListener('click', async () => {
  setButtonLoading(refreshBtn, true);

  const response = await sendMessage('GET_BALANCE');

  if (response.success && response.data) {
    const data = response.data as { balance: string; isLocked?: boolean };
    balanceAmount.textContent = data.balance;

    if (data.isLocked !== undefined && data.isLocked !== isLocked) {
      isLocked = data.isLocked;
      if (isLocked) {
        statusBadge.textContent = 'Quantum Secure';
        statusBadge.className = 'status-badge secure';
        lockWalletBtn.disabled = true;
        lockWalletBtn.textContent = 'Wallet Locked';
      }
      await updateAccountsList();
    }

    showMessage('Balance refreshed!', 'success');
  } else {
    showMessage(response.error || 'Failed to refresh balance', 'error');
  }

  setButtonLoading(refreshBtn, false, 'Refresh');
});

deleteAccountBtn.addEventListener('click', async () => {
  const confirmed = confirm(
    'Are you sure you want to delete this account?\n\n' +
    'WARNING: This will permanently delete the account and all associated keys.\n' +
    'Make sure you have backed up any funds!\n\n' +
    'Continue?'
  );

  if (!confirmed) return;

  setButtonLoading(deleteAccountBtn, true);

  const response = await sendMessage('DELETE_ACCOUNT', { accountId: currentAccountId });

  if (response.success && response.data) {
    const data = response.data as { activeWallet: AccountData | null };

    if (data.activeWallet) {
      currentAccountId = data.activeWallet.id;
      currentAddress = data.activeWallet.address;
      isLocked = data.activeWallet.isLocked;

      // Get balance for new active account
      const balanceResponse = await sendMessage('GET_BALANCE');
      let balance = '0';
      if (balanceResponse.success && balanceResponse.data) {
        const balanceData = balanceResponse.data as { balance: string };
        balance = balanceData.balance;
      }

      updateUI(true, data.activeWallet.address, balance, data.activeWallet.isLocked, data.activeWallet.name, data.activeWallet.id);
      showMessage('Account deleted', 'success');
    } else {
      // No more accounts
      updateUI(false);
      showMessage('Account deleted. Create a new wallet to continue.', 'info');
    }
  } else {
    showMessage(response.error || 'Failed to delete account', 'error');
  }

  setButtonLoading(deleteAccountBtn, false, 'Delete Account');
});

sendBtn.addEventListener('click', async () => {
  const destination = destAddressInput.value.trim();
  const amount = sendAmountInput.value.trim();

  if (!destination) {
    showMessage('Please enter a destination address', 'error');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    showMessage('Please enter a valid amount', 'error');
    return;
  }

  if (!isLocked) {
    showMessage('Please lock the wallet first for quantum security', 'error');
    return;
  }

  setButtonLoading(sendBtn, true);

  const response = await sendMessage('SEND_XLM', { to: destination, amount });

  if (response.success && response.data) {
    const data = response.data as { txHash: string; message: string };
    showMessage(`Transaction sent! Hash: ${data.txHash.slice(0, 16)}...`, 'success');

    // Clear inputs
    destAddressInput.value = '';
    sendAmountInput.value = '';

    // Refresh balance
    const balanceResponse = await sendMessage('GET_BALANCE');
    if (balanceResponse.success && balanceResponse.data) {
      const balanceData = balanceResponse.data as { balance: string };
      balanceAmount.textContent = balanceData.balance;
    }
  } else {
    showMessage(response.error || 'Transaction failed', 'error');
  }

  setButtonLoading(sendBtn, false, 'Send XLM');
});

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');

    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`${tabName}Tab`)?.classList.add('active');
  });
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
