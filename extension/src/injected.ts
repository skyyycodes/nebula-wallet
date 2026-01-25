/**
 * Injected Script - Nebula Provider
 *
 * This script is injected into web pages and exposes the window.quantumStellar API
 * It communicates with the content script via postMessage
 *
 * Provider pattern similar to MetaMask's window.ethereum
 */

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type EventCallback = (data: unknown) => void;

const pendingRequests: Map<string, PendingRequest> = new Map();

// Generate unique request ID
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Send message to extension and wait for response
function sendToExtension(type: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();

    pendingRequests.set(requestId, { resolve, reject });

    window.postMessage({
      target: 'quantum-stellar-extension',
      type,
      payload,
      requestId
    }, '*');

    // Timeout after 60 seconds (longer for connect which shows popup)
    const timeout = type === 'CONNECT' ? 300000 : 60000;
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, timeout);
  });
}

// Listen for responses from the content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data) return;

  // Handle regular responses
  if (event.data.target === 'quantum-stellar-page') {
    const { requestId, response } = event.data;

    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);

      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error || 'Unknown error'));
      }
    }
  }

  // Handle events from extension
  if (event.data.target === 'quantum-stellar-page-event') {
    const { eventType, data } = event.data;
    provider._emit(eventType, data);
  }
});

/**
 * Nebula Provider Class
 * Implements a MetaMask-like provider pattern for Stellar
 */
class QuantumStellarProvider {
  private _connected = false;
  private _address: string | null = null;
  private _eventListeners: Map<string, Set<EventCallback>> = new Map();

  // Metadata
  readonly isQuantumStellar = true;
  readonly version = '1.0.0';

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get current address (null if not connected)
   */
  getAddress(): string | null {
    return this._address;
  }

  /**
   * Connect to the wallet
   * Opens approval popup if not already connected
   */
  async connect(): Promise<{ address: string }> {
    try {
      const result = await sendToExtension('CONNECT') as { address: string };
      if (result.address) {
        this._connected = true;
        this._address = result.address;
        this._emit('connect', { address: result.address });
      }
      return result;
    } catch (error) {
      this._emit('error', { message: error instanceof Error ? error.message : 'Connection failed' });
      throw error;
    }
  }

  /**
   * Disconnect from the wallet
   */
  async disconnect(): Promise<void> {
    try {
      await sendToExtension('DISCONNECT_SITE', { origin: window.location.origin });
      this._connected = false;
      this._address = null;
      this._emit('disconnect', {});
    } catch (error) {
      // Still update local state even if request fails
      this._connected = false;
      this._address = null;
      this._emit('disconnect', {});
    }
  }

  /**
   * Get connected accounts
   * Returns empty array if not connected
   */
  async getAccounts(): Promise<string[]> {
    if (!this._connected || !this._address) {
      return [];
    }
    return [this._address];
  }

  /**
   * Check connection status with extension
   */
  async checkConnection(): Promise<{ connected: boolean; address: string | null }> {
    try {
      const result = await sendToExtension('IS_CONNECTED') as { connected: boolean; address: string | null };
      this._connected = result.connected;
      this._address = result.address;
      return result;
    } catch {
      this._connected = false;
      this._address = null;
      return { connected: false, address: null };
    }
  }

  /**
   * Get the current balance
   * @throws Error if not connected
   */
  async getBalance(): Promise<string> {
    this._requireConnection();
    const result = await sendToExtension('GET_BALANCE') as { balance: string };
    return result.balance;
  }

  /**
   * Send XLM to a destination address
   * @throws Error if not connected
   */
  async sendXLM(to: string, amount: string): Promise<{ txHash: string }> {
    this._requireConnection();
    if (!to || !amount) {
      throw new Error('Destination address and amount are required');
    }
    return await sendToExtension('SEND_XLM', { to, amount }) as { txHash: string };
  }

  /**
   * Swap tokens using Stellar DEX
   * @param sendAsset - Asset to send { code, issuer }
   * @param destAsset - Asset to receive { code, issuer }
   * @param sendAmount - Amount to send
   * @param destMinAmount - Minimum amount to receive (with slippage)
   * @param pathAssets - Optional intermediate assets for path payment
   * @throws Error if not connected
   */
  async swapTokens(
    sendAsset: { code: string; issuer: string | null },
    destAsset: { code: string; issuer: string | null },
    sendAmount: string,
    destMinAmount: string,
    pathAssets?: Array<{ code: string; issuer: string | null }>
  ): Promise<{ txHash: string }> {
    this._requireConnection();
    if (!sendAsset || !destAsset || !sendAmount || !destMinAmount) {
      throw new Error('All swap parameters are required');
    }
    return await sendToExtension('SWAP_TOKENS', {
      sendAsset,
      destAsset,
      sendAmount,
      destMinAmount,
      pathAssets: pathAssets || []
    }) as { txHash: string };
  }

  /**
   * Subscribe to an event
   *
   * Supported events:
   * - 'connect' - Fired when wallet connects
   * - 'disconnect' - Fired when wallet disconnects
   * - 'accountsChanged' - Fired when active account changes
   * - 'error' - Fired on errors
   */
  on(event: string, callback: EventCallback): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: EventCallback): void {
    this._eventListeners.get(event)?.delete(callback);
  }

  /**
   * Subscribe to an event (once)
   */
  once(event: string, callback: EventCallback): void {
    const wrappedCallback: EventCallback = (data) => {
      this.off(event, wrappedCallback);
      callback(data);
    };
    this.on(event, wrappedCallback);
  }

  /**
   * Emit an event to all listeners
   * @internal
   */
  _emit(event: string, data: unknown): void {
    this._eventListeners.get(event)?.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error('Nebula: Event handler error', err);
      }
    });
  }

  /**
   * Generic message sender for advanced use
   * Returns full response object
   */
  async sendMessage(type: string, payload?: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return new Promise((resolve) => {
      const requestId = generateRequestId();

      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!event.data || event.data.target !== 'quantum-stellar-page') return;
        if (event.data.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        resolve(event.data.response);
      };

      window.addEventListener('message', handler);

      window.postMessage({
        target: 'quantum-stellar-extension',
        type,
        payload,
        requestId
      }, '*');

      // Timeout after 60 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'Request timeout' });
      }, 60000);
    });
  }

  /**
   * Require connection for protected methods
   * @internal
   */
  private _requireConnection(): void {
    if (!this._connected) {
      throw new Error('Wallet not connected. Call connect() first.');
    }
  }
}

// Create the provider instance
const provider = new QuantumStellarProvider();

// Expose the API on the window object
Object.defineProperty(window, 'quantumStellar', {
  value: provider,
  writable: false,
  configurable: false
});

// Auto-check connection status on load
provider.checkConnection().then(({ connected, address }) => {
  if (connected) {
    console.log('Nebula: Auto-reconnected to', address);
  }
});

// Dispatch event to notify that the API is ready
window.dispatchEvent(new CustomEvent('quantumStellarReady'));

console.log('Nebula Provider injected: window.quantumStellar');
