/**
 * Content Script
 *
 * Bridges communication between the injected page script and the background service worker
 * This script runs in the context of web pages
 */

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid(): boolean {
  try {
    // This will throw if context is invalidated
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Safely send message to background script
 * Returns null if extension context is invalidated
 */
async function safeSendMessage(message: unknown): Promise<unknown> {
  if (!isExtensionContextValid()) {
    throw new Error('Extension context invalidated. Please refresh the page.');
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    // Check for specific extension context error
    if (error instanceof Error &&
      (error.message.includes('Extension context invalidated') ||
        error.message.includes('Could not establish connection'))) {
      throw new Error('Extension context invalidated. Please refresh the page.');
    }
    throw error;
  }
}

// Inject the API script into the page
function injectScript() {
  try {
    if (!isExtensionContextValid()) {
      console.warn('Nebula: Extension context invalidated, cannot inject script');
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
      script.remove();
    };
    script.onerror = function () {
      console.error('Nebula: Failed to load injected script');
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('Nebula: Error injecting script:', error);
  }
}

// Inject immediately
injectScript();

// Listen for events from background script to broadcast to page
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (!isExtensionContextValid()) return false;

    if (message.type === 'BROADCAST_EVENT') {
      // Forward event to the injected script
      window.postMessage({
        target: 'quantum-stellar-page-event',
        eventType: message.eventType,
        data: message.data
      }, '*');
    }
    return false; // No async response needed
  });
} catch (error) {
  console.warn('Nebula: Could not set up message listener:', error);
}

// Listen for messages from the injected script
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  // Handle X402 payment requests from websites
  if (event.data?.type === 'QUANTUM_STELLAR_X402_REQUEST') {
    const { origin, requirements } = event.data.payload;

    try {
      // Forward to background script for processing
      const response = await safeSendMessage({
        type: 'X402_SIGN_PAYMENT',
        payload: {
          requirements,
          origin: origin || window.location.origin
        }
      });

      // Send response back to page
      window.postMessage({
        type: 'QUANTUM_STELLAR_X402_RESPONSE',
        payload: response
      }, '*');
    } catch (error) {
      window.postMessage({
        type: 'QUANTUM_STELLAR_X402_RESPONSE',
        payload: {
          success: false,
          error: error instanceof Error ? error.message : 'X402 payment failed'
        }
      }, '*');
    }
    return;
  }

  // Only handle messages for our extension
  if (!event.data || event.data.target !== 'quantum-stellar-extension') return;

  const { type, payload, requestId } = event.data;

  console.log('[Content Script] Forwarding message:', type);

  try {
    // Forward the message to the background script
    const response = await safeSendMessage({ type, payload });

    console.log('[Content Script] Got response:', response);

    // Send the response back to the page
    window.postMessage({
      target: 'quantum-stellar-page',
      requestId,
      response
    }, '*');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Extension communication error';

    // Send error response back to the page
    window.postMessage({
      target: 'quantum-stellar-page',
      requestId,
      response: {
        success: false,
        error: errorMessage
      }
    }, '*');

    // If context is invalidated, notify the page
    if (errorMessage.includes('invalidated')) {
      window.postMessage({
        target: 'quantum-stellar-page-event',
        eventType: 'error',
        data: {
          message: errorMessage,
          needsRefresh: true
        }
      }, '*');
    }
  }
});

console.log('Nebula Wallet content script loaded');
