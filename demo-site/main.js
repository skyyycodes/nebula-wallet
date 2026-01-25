/**
 * Demo Website JavaScript
 *
 * Interacts with the Quantum Stellar Wallet extension via window.quantumStellar API
 */

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const notConnected = document.getElementById('notConnected');
const connected = document.getElementById('connected');
const walletAddress = document.getElementById('walletAddress');
const walletBalance = document.getElementById('walletBalance');
const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
const sendForm = document.getElementById('sendForm');
const sendBtn = document.getElementById('sendBtn');
const destinationAddress = document.getElementById('destinationAddress');
const amountInput = document.getElementById('amount');
const noTransaction = document.getElementById('noTransaction');
const transactionStatus = document.getElementById('transactionStatus');
const transactionResult = document.getElementById('transactionResult');

// State
let isConnected = false;
let connectedAddress = '';

/**
 * Check if the wallet extension is available
 */
function isWalletAvailable() {
  return typeof window.quantumStellar !== 'undefined';
}

/**
 * Wait for wallet to be ready
 */
function waitForWallet(timeout = 3000) {
  return new Promise((resolve) => {
    if (isWalletAvailable()) {
      resolve(true);
      return;
    }

    const handler = () => {
      window.removeEventListener('quantumStellarReady', handler);
      resolve(true);
    };

    window.addEventListener('quantumStellarReady', handler);

    setTimeout(() => {
      window.removeEventListener('quantumStellarReady', handler);
      resolve(isWalletAvailable());
    }, timeout);
  });
}

/**
 * Format XLM balance for display
 */
function formatBalance(balance) {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0 XLM';
  return `${num.toFixed(4)} XLM`;
}

/**
 * Truncate address for display
 */
function truncateAddress(address) {
  if (!address || address.length < 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

/**
 * Update connection UI
 */
function updateConnectionUI(connected_, address, balance) {
  if (connected_) {
    notConnected.classList.add('hidden');
    connected.classList.remove('hidden');
    walletAddress.textContent = truncateAddress(address);
    walletAddress.title = address; // Full address on hover
    walletBalance.textContent = formatBalance(balance);
    sendBtn.disabled = false;
    isConnected = true;
    connectedAddress = address;
  } else {
    notConnected.classList.remove('hidden');
    connected.classList.add('hidden');
    sendBtn.disabled = true;
    isConnected = false;
    connectedAddress = '';
  }
}

/**
 * Show transaction result
 */
function showTransactionResult(type, title, message, txHash) {
  noTransaction.classList.add('hidden');
  transactionStatus.classList.remove('hidden');

  let icon = '';
  switch (type) {
    case 'success':
      icon = '✅';
      break;
    case 'error':
      icon = '❌';
      break;
    case 'pending':
      icon = '⏳';
      break;
  }

  let html = `
    <div class="transaction-result ${type}">
      <h4>${icon} ${title}</h4>
      <p>${message}</p>
  `;

  if (txHash) {
    html += `
      <div class="tx-hash">TX: ${txHash}</div>
      <a href="https://stellar.expert/explorer/testnet/tx/${txHash}" target="_blank" class="tx-link">
        View on Stellar Expert →
      </a>
    `;
  }

  html += '</div>';
  transactionResult.innerHTML = html;
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loading, originalText) {
  if (loading) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<span class="loading"></span> Processing...';
    button.disabled = true;
  } else {
    button.innerHTML = originalText || button.dataset.originalText;
    button.disabled = false;
  }
}

/**
 * Connect to wallet
 */
async function connectWallet() {
  if (!isWalletAvailable()) {
    alert('Quantum Stellar Wallet extension not found!\n\nPlease install the extension and refresh the page.');
    return;
  }

  setButtonLoading(connectBtn, true);

  try {
    const result = await window.quantumStellar.connect();

    if (result.address) {
      // Get balance
      let balance = '0';
      try {
        balance = await window.quantumStellar.getBalance();
      } catch (e) {
        console.log('Could not get balance:', e);
      }

      updateConnectionUI(true, result.address, balance);
    }
  } catch (error) {
    alert(`Connection failed: ${error.message}`);
  } finally {
    setButtonLoading(connectBtn, false, '<span class="btn-icon">🔗</span> Connect Quantum Wallet');
  }
}

/**
 * Refresh balance
 */
async function refreshBalance() {
  if (!isConnected) return;

  setButtonLoading(refreshBalanceBtn, true);

  try {
    const balance = await window.quantumStellar.getBalance();
    walletBalance.textContent = formatBalance(balance);
  } catch (error) {
    console.error('Failed to refresh balance:', error);
  } finally {
    setButtonLoading(refreshBalanceBtn, false, 'Refresh Balance');
  }
}

/**
 * Send XLM
 */
async function sendXLM(event) {
  event.preventDefault();

  if (!isConnected) {
    alert('Please connect your wallet first');
    return;
  }

  const destination = destinationAddress.value.trim();
  const amount = amountInput.value.trim();

  if (!destination) {
    alert('Please enter a destination address');
    return;
  }

  if (!destination.startsWith('G') || destination.length !== 56) {
    alert('Invalid Stellar address. Must start with G and be 56 characters.');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    alert('Please enter a valid amount');
    return;
  }

  setButtonLoading(sendBtn, true);
  showTransactionResult('pending', 'Processing Transaction', 'Building and signing transaction with SPHINCS+...');

  try {
    const result = await window.quantumStellar.sendXLM(destination, amount);

    if (result.txHash) {
      showTransactionResult(
        'success',
        'Transaction Successful!',
        `Successfully sent ${amount} XLM to ${truncateAddress(destination)}`,
        result.txHash
      );

      // Clear form
      destinationAddress.value = '';
      amountInput.value = '';

      // Refresh balance
      setTimeout(refreshBalance, 2000);
    }
  } catch (error) {
    showTransactionResult(
      'error',
      'Transaction Failed',
      error.message || 'An error occurred while sending the transaction'
    );
  } finally {
    setButtonLoading(sendBtn, false, '<span class="btn-icon">📤</span> Send XLM');
  }
}

// Event Listeners
connectBtn.addEventListener('click', connectWallet);
refreshBalanceBtn.addEventListener('click', refreshBalance);
sendForm.addEventListener('submit', sendXLM);

// X402 Demo Elements
const x402DemoBtn = document.getElementById('x402DemoBtn');
const x402Status = document.getElementById('x402Status');
const x402Result = document.getElementById('x402Result');

/**
 * Simulate X402 payment flow
 */
async function simulateX402Flow() {
  if (!isWalletAvailable()) {
    alert('Please install the Quantum Stellar Wallet extension');
    return;
  }

  setButtonLoading(x402DemoBtn, true);
  x402Status.classList.remove('hidden');
  x402Result.innerHTML = '<div class="x402-pending">⏳ Simulating 402 Payment Required...</div>';

  try {
    // Simulate a 402 response from a paid API (X402 v2 format)
    const paymentRequirements = {
      accepts: [{
        scheme: 'exact',
        price: '$0.001', // Price in dollars (converted to 0.1 XLM)
        network: 'stellar:testnet', // Stellar testnet
        payTo: 'GC63PWNQKUVXE6QNQOQVPXM7S5W5BSIRT45VJM7UPVHMXP7XDXV6RFEZ' // Demo payee
      }],
      description: 'Premium API access',
      mimeType: 'application/json'
    };

    // Send to extension for signing
    const response = await new Promise((resolve, reject) => {
      // Post message to content script
      window.postMessage({
        type: 'QUANTUM_STELLAR_X402_REQUEST',
        payload: {
          origin: window.location.origin,
          requirements: paymentRequirements
        }
      }, '*');

      // Listen for response
      const handler = (event) => {
        if (event.data?.type === 'QUANTUM_STELLAR_X402_RESPONSE') {
          window.removeEventListener('message', handler);
          if (event.data.payload.success) {
            resolve(event.data.payload);
          } else {
            reject(new Error(event.data.payload.error || 'Payment rejected'));
          }
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 60 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Payment request timed out'));
      }, 60000);
    });

    // Success!
    x402Result.innerHTML = `
      <div class="x402-success">
        <h4>✅ Payment Signed!</h4>
        <p>PAYMENT-SIGNATURE header generated successfully</p>
        <div class="x402-details">
          <div><strong>Payment Signature:</strong> ${response.paymentSignature?.slice(0, 32)}...</div>
          <div><strong>Amount:</strong> $0.001 (~0.1 XLM)</div>
        </div>
        <p class="x402-note">In a real scenario, this header would be sent to the API server for verification.</p>
      </div>
    `;

  } catch (error) {
    x402Result.innerHTML = `
      <div class="x402-error">
        <h4>❌ Payment Failed</h4>
        <p>${error.message}</p>
        <p class="x402-hint">Make sure you have a spending account with funds.</p>
      </div>
    `;
  } finally {
    setButtonLoading(x402DemoBtn, false, '<span class="btn-icon">💳</span> Call Paid API');
  }
}

// X402 event listener
if (x402DemoBtn) {
  x402DemoBtn.addEventListener('click', simulateX402Flow);
}

// Initialize
async function init() {
  // Wait for wallet extension to be ready
  const walletReady = await waitForWallet();

  if (!walletReady) {
    console.log('Quantum Stellar Wallet not detected');
    connectBtn.textContent = 'Install Wallet Extension';
  } else {
    console.log('Quantum Stellar Wallet detected');

    // Try to reconnect if previously connected
    try {
      const result = await window.quantumStellar.connect();
      if (result.address) {
        const balance = await window.quantumStellar.getBalance();
        updateConnectionUI(true, result.address, balance);
      }
    } catch (e) {
      // Not connected, that's fine
      console.log('Wallet not connected');
    }
  }
}

// Run initialization
init();
