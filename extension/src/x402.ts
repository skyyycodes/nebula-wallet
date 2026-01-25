/**
 * X402 Payment Handler
 * 
 * Implements the Stellar X402 protocol for handling 402 Payment Required responses.
 * Based on the x402-stellar specification.
 * 
 * Flow:
 * 1. Website requests resource → gets 402 with PaymentRequirements
 * 2. Content script forwards to background
 * 3. Background checks policy, builds & signs transaction
 * 4. Returns X-PAYMENT header to content script
 * 5. Website retries with X-PAYMENT header
 */

import type {
  X402PaymentRequirements,
  X402PaymentPayload,
  X402Response,
  ServicePolicy,
  TransactionActivity
} from './types';
import {
  signX402Payment,
  getSpendingBalance,
  canAffordPayment,
  stroopsToXLM,
  submitTransaction
} from './spending';
import {
  getServicePolicy,
  upsertServicePolicy,
  createDefaultPolicy,
  updateServiceSpending,
  addActivityEntry,
  loadSpendingAccount
} from './storage';

// Facilitator URL (for verification/settlement)
const DEFAULT_FACILITATOR_URL = 'http://localhost:4022';

/**
 * Generate a unique nonce for payment idempotency
 */
function generateNonce(): string {
  return crypto.randomUUID();
}

/**
 * Parse payment requirements from 402 response body or demo site
 * Supports both X402 v2 format (accepts array) and legacy format
 */
export function parsePaymentRequirements(body: unknown): X402PaymentRequirements | null {
  try {
    console.log('[X402 Parse] Raw input:', body, 'type:', typeof body);

    // Handle string input (might be JSON stringified)
    let data: any = body;
    if (typeof body === 'string') {
      try {
        data = JSON.parse(body);
        console.log('[X402 Parse] Parsed JSON string to:', data);
      } catch {
        console.error('[X402 Parse] Failed to parse string as JSON');
        return null;
      }
    }

    // Unwrap nested shape like { requirements: {...} }
    if (data && typeof data === 'object' && 'requirements' in data && !('accepts' in data)) {
      const nested = (data as any).requirements;
      if (nested) {
        console.log('[X402 Parse] Unwrapped nested requirements');
        data = nested;
      }
    }

    if (!data || typeof data !== 'object') {
      console.error('[X402 Parse] Invalid: not an object, got:', typeof data);
      return null;
    }

    console.log('[X402 Parse] Data keys:', Object.keys(data));

    // If accepts is a stringified array/object, try parsing it
    if (typeof (data as any).accepts === 'string') {
      try {
        (data as any).accepts = JSON.parse((data as any).accepts);
        console.log('[X402 Parse] Parsed stringified accepts');
      } catch {
        console.error('[X402 Parse] Failed to parse stringified accepts');
      }
    }

    // X402 v2 format: { accepts: [{ scheme, price, network, payTo }], description?, mimeType? }
    if (data.accepts && Array.isArray(data.accepts) && data.accepts.length > 0) {
      console.log('[X402 Parse] ✓ Found X402 v2 format with accepts array');
      const accept = data.accepts[0]; // Use first payment option

      // Convert price from dollars to stroops (assuming $0.001 = ~0.1 XLM)
      let maxAmountRequired = '1000000'; // Default 0.1 XLM in stroops
      if (accept.price && typeof accept.price === 'string') {
        // Parse price like "$0.001" and convert to XLM, then to stroops
        const priceMatch = accept.price.match(/\$(\d+(?:\.\d+)?)/);
        if (priceMatch) {
          const dollarAmount = parseFloat(priceMatch[1]);
          // Rough conversion: $1 ≈ 10 XLM (adjust based on market rates)
          const xlmAmount = dollarAmount * 100; // For demo: $0.001 → 0.1 XLM
          maxAmountRequired = Math.round(xlmAmount * 10000000).toString(); // Convert to stroops
          console.log(`[X402] Converted ${accept.price} to ${xlmAmount} XLM (${maxAmountRequired} stroops)`);
        }
      }

      const requirements: X402PaymentRequirements = {
        scheme: accept.scheme || 'exact',
        network: accept.network?.replace('stellar:', 'stellar-') || 'stellar-testnet',
        maxAmountRequired,
        resource: data.resource || '/api/premium/data',
        payTo: accept.payTo,
        asset: 'native',
        description: data.description,
        mimeType: data.mimeType
      };

      console.log('[X402] Parsed requirements:', requirements);
      return requirements;
    }

    // Legacy X402Response format: { x402Version, accepts: [X402PaymentRequirements] }
    if (data.x402Version && data.accepts && Array.isArray(data.accepts)) {
      console.log('[X402] Parsing legacy X402Response format');
      const stellarOption = data.accepts.find(
        (opt: any) => opt.network?.startsWith('stellar') && opt.asset === 'native'
      );

      if (!stellarOption) {
        console.error('[X402] No Stellar payment option found');
        return null;
      }

      return stellarOption;
    }

    // Direct X402PaymentRequirements object
    if (data.scheme && data.payTo) {
      console.log('[X402] Using direct payment requirements');
      return data as X402PaymentRequirements;
    }

    console.error('[X402] Unrecognized payment requirements format:', data);
    return null;
  } catch (error) {
    console.error('[X402] Failed to parse payment requirements:', error);
    return null;
  }
}

/**
 * Create X-PAYMENT header value (base64-encoded PaymentPayload)
 * Also submits the transaction to the Stellar network
 */
export async function createPaymentHeader(
  requirements: X402PaymentRequirements,
  submitToNetwork: boolean = true
): Promise<{ header: string; payload: X402PaymentPayload; txHash: string; submitted: boolean }> {
  const account = await loadSpendingAccount();
  if (!account) {
    throw new Error('No spending account found');
  }

  // Build and sign the payment transaction
  const { xdr, hash } = await signX402Payment(
    requirements.payTo,
    requirements.maxAmountRequired,
    `x402:${requirements.resource.slice(0, 20)}`
  );

  // Submit transaction to network
  let submitted = false;
  if (submitToNetwork) {
    try {
      console.log(`[X402] Submitting transaction ${hash} to Stellar network...`);
      await submitTransaction(xdr);
      console.log(`[X402] Transaction ${hash} submitted successfully!`);
      submitted = true;
    } catch (submitError) {
      console.error(`[X402] Transaction submission failed:`, submitError);
      throw new Error(`Transaction submission failed: ${submitError instanceof Error ? submitError.message : String(submitError)}`);
    }
  }

  // Create the payload
  const payload: X402PaymentPayload = {
    signedTxXdr: xdr,
    sourceAccount: account.publicKey,
    destination: requirements.payTo,
    amount: requirements.maxAmountRequired,
    asset: requirements.asset,
    nonce: generateNonce()
  };

  // Base64 encode the JSON payload
  const header = btoa(JSON.stringify(payload));

  return { header, payload, txHash: hash, submitted };
}

/**
 * Check if payment is allowed by service policy
 */
export async function checkPaymentPolicy(
  origin: string,
  requirements: X402PaymentRequirements
): Promise<{
  allowed: boolean;
  reason?: string;
  policy?: ServicePolicy;
  needsPrompt?: boolean;
}> {
  const amountXLM = stroopsToXLM(requirements.maxAmountRequired);
  const amountNum = parseFloat(amountXLM);

  // Check spending account balance
  const canAfford = await canAffordPayment(requirements.maxAmountRequired);
  if (!canAfford) {
    return {
      allowed: false,
      reason: 'Insufficient spending account balance'
    };
  }

  // Get or create policy for this origin
  let policy = await getServicePolicy(origin);

  if (!policy) {
    // First time seeing this service - create default policy
    policy = createDefaultPolicy(origin);
    await upsertServicePolicy(policy);
  }

  // Check permission mode
  if (policy.permission === 'deny') {
    return {
      allowed: false,
      reason: 'Service is blocked',
      policy
    };
  }

  if (policy.permission === 'prompt') {
    return {
      allowed: false,
      needsPrompt: true,
      reason: 'User approval required',
      policy
    };
  }

  // Auto mode - check limits
  const maxPerTx = parseFloat(policy.maxPerTransaction);
  if (amountNum > maxPerTx) {
    return {
      allowed: false,
      needsPrompt: true,
      reason: `Amount ${amountXLM} XLM exceeds per-transaction limit of ${maxPerTx} XLM`,
      policy
    };
  }

  // Check daily limit
  const today = new Date().toDateString();
  let spentToday = 0;

  if (policy.lastResetDate === today) {
    spentToday = parseFloat(policy.spentToday) || 0;
  }

  const maxPerDay = parseFloat(policy.maxPerDay);
  if (spentToday + amountNum > maxPerDay) {
    return {
      allowed: false,
      needsPrompt: true,
      reason: `Daily limit would be exceeded (spent: ${spentToday.toFixed(2)}, limit: ${maxPerDay})`,
      policy
    };
  }

  return {
    allowed: true,
    policy
  };
}

/**
 * Process an X402 payment request
 */
export async function processX402Payment(
  origin: string,
  requirements: X402PaymentRequirements
): Promise<{
  success: boolean;
  xPaymentHeader?: string;
  txHash?: string;
  activityId?: string;
  submitted?: boolean;
  error?: string;
  needsPrompt?: boolean;
}> {
  // Check policy
  const policyCheck = await checkPaymentPolicy(origin, requirements);

  if (!policyCheck.allowed) {
    if (policyCheck.needsPrompt) {
      return {
        success: false,
        needsPrompt: true,
        error: policyCheck.reason
      };
    }
    return {
      success: false,
      error: policyCheck.reason
    };
  }

  try {
    // Create the payment header and submit to network
    const { header, payload, txHash, submitted } = await createPaymentHeader(requirements, true);

    // Log activity
    const amountXLM = stroopsToXLM(requirements.maxAmountRequired);
    const activity: TransactionActivity = {
      id: generateNonce(),
      accountId: payload.sourceAccount, // Use spending account address as accountId
      type: 'payment',
      origin,
      resource: requirements.resource,
      amount: amountXLM,
      status: submitted ? 'completed' : 'pending',
      txHash,
      timestamp: Date.now()
    };

    await addActivityEntry(activity);

    // Update daily spending for service
    await updateServiceSpending(origin, amountXLM);

    console.log(`[X402] Payment ${submitted ? 'submitted' : 'prepared'}: ${amountXLM} XLM to ${requirements.payTo}`);

    return {
      success: true,
      xPaymentHeader: header,
      txHash,
      activityId: activity.id,
      submitted
    };
  } catch (error) {
    console.error('[X402] Payment failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment failed'
    };
  }
}

/**
 * Force approve a payment (user confirmed via prompt)
 */
export async function forceApprovePayment(
  origin: string,
  requirements: X402PaymentRequirements
): Promise<{
  success: boolean;
  xPaymentHeader?: string;
  txHash?: string;
  activityId?: string;
  submitted?: boolean;
  error?: string;
}> {
  try {
    // Check balance only
    const canAfford = await canAffordPayment(requirements.maxAmountRequired);
    if (!canAfford) {
      return {
        success: false,
        error: 'Insufficient spending account balance'
      };
    }

    // Create the payment header and submit to network
    const { header, payload, txHash, submitted } = await createPaymentHeader(requirements, true);

    // Log activity
    const amountXLM = stroopsToXLM(requirements.maxAmountRequired);
    const activity: TransactionActivity = {
      id: generateNonce(),
      accountId: payload.sourceAccount, // Use spending account address as accountId
      type: 'payment',
      origin,
      resource: requirements.resource,
      amount: amountXLM,
      status: submitted ? 'completed' : 'pending',
      txHash,
      timestamp: Date.now()
    };

    await addActivityEntry(activity);

    // Update daily spending
    await updateServiceSpending(origin, amountXLM);

    console.log(`[X402] Payment force-approved and ${submitted ? 'submitted' : 'prepared'}: ${amountXLM} XLM to ${requirements.payTo}`);

    return {
      success: true,
      xPaymentHeader: header,
      txHash,
      activityId: activity.id,
      submitted
    };
  } catch (error) {
    console.error('[X402] Force-approve failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment failed'
    };
  }
}

/**
 * Verify payment with facilitator (optional)
 */
export async function verifyPaymentWithFacilitator(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
  facilitatorUrl: string = DEFAULT_FACILITATOR_URL
): Promise<{ valid: boolean; payer?: string; error?: string }> {
  try {
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: payload,
        paymentRequirements: requirements
      })
    });

    const result = await response.json();
    return {
      valid: result.isValid === true,
      payer: result.payer
    };
  } catch (error) {
    console.error('[X402] Facilitator verification failed:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}
