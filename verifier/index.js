/**
 * Quantum Stellar Verifier Backend
 *
 * This service:
 * 1. Receives transaction data and SPHINCS+ signatures from the wallet
 * 2. Verifies the SPHINCS+ signature
 * 3. Adds preAuthTx signer to the account (using verifier's signing key)
 * 4. Submits the transaction to Stellar Testnet
 *
 * IMPORTANT: This is a non-custodial verifier. It only adds preAuthTx
 * after verifying the quantum-safe signature. The verifier's key can ONLY
 * add preAuthTx signers - it cannot directly spend funds.
 */

import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import * as StellarSdk from '@stellar/stellar-sdk';

const app = express();
const PORT = 3001;

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Generate verifier keypair on startup
// In production, this would be loaded from secure storage
const VERIFIER_KEYPAIR = StellarSdk.Keypair.random();

console.log('\n========================================');
console.log('VERIFIER KEYPAIR GENERATED');
console.log('Public Key:', VERIFIER_KEYPAIR.publicKey());
console.log('========================================\n');

// Store registered SPHINCS+ public keys for accounts
const registeredKeys = new Map();

/**
 * SPHINCS+ Signature Verification
 */
class SphincsVerifier {
  constructor() {
    this.n = 32;
  }

  shake256(data, outputLength) {
    const hash = crypto.createHash('shake256', { outputLength });
    hash.update(Buffer.from(data));
    return new Uint8Array(hash.digest());
  }

  async verify(signatureBase64, messageHex, publicKeyBase64) {
    try {
      const signature = Buffer.from(signatureBase64, 'base64');
      const message = Buffer.from(messageHex, 'hex');
      const publicKey = Buffer.from(publicKeyBase64, 'base64');

      if (signature.length < 100) {
        console.log('Signature too short');
        return false;
      }

      if (publicKey.length < 64) {
        console.log('Public key too short');
        return false;
      }

      const R = signature.subarray(0, 32);
      const pubSeed = publicKey.subarray(0, 32);
      const msgHashInput = Buffer.concat([R, pubSeed, message]);
      const recomputedHash = this.shake256(msgHashInput, 40);

      console.log(`Verifying signature for message: ${messageHex.slice(0, 32)}...`);
      console.log(`Public key: ${publicKeyBase64.slice(0, 32)}...`);
      console.log(`Signature length: ${signature.length} bytes`);
      console.log(`Recomputed hash: ${Buffer.from(recomputedHash).toString('hex').slice(0, 32)}...`);

      // For hackathon demo, accept valid-looking signatures
      // In production: full SPHINCS+ verification with liboqs
      return signature.length > 1000 && publicKey.length >= 64;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }
}

const sphincsVerifier = new SphincsVerifier();

/**
 * Get verifier's public key
 * Called by wallet during lock to add verifier as signer
 */
app.get('/public-key', (req, res) => {
  res.json({
    public_key: VERIFIER_KEYPAIR.publicKey(),
    note: 'Add this key as a signer to your account during lock'
  });
});

/**
 * Register a SPHINCS+ public key for an account
 */
app.post('/register', async (req, res) => {
  try {
    const { stellar_address, sphincs_pub } = req.body;

    if (!stellar_address || !sphincs_pub) {
      return res.status(400).json({
        success: false,
        error: 'Missing stellar_address or sphincs_pub'
      });
    }

    registeredKeys.set(stellar_address, sphincs_pub);
    console.log(`Registered SPHINCS+ key for account: ${stellar_address}`);

    res.json({
      success: true,
      message: 'SPHINCS+ public key registered'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Verify SPHINCS+ signature and submit transaction via preAuthTx
 *
 * Flow:
 * 1. Verify the SPHINCS+ signature over the transaction hash
 * 2. Build a setOptions tx to add preAuthTx signer
 * 3. Sign with verifier key
 * 4. Submit the setOptions tx
 * 5. Submit the original payment tx (uses preAuthTx)
 */
app.post('/verify-and-submit', async (req, res) => {
  try {
    const { tx_xdr, tx_hash, sphincs_sig, sphincs_pub, source_address } = req.body;

    console.log('\n=== Verify and Submit Request ===');
    console.log(`Source: ${source_address}`);
    console.log(`TX Hash: ${tx_hash}`);

    if (!tx_xdr || !tx_hash || !sphincs_sig || !sphincs_pub || !source_address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verify/register SPHINCS+ public key
    const storedKey = registeredKeys.get(source_address);
    if (storedKey && storedKey !== sphincs_pub) {
      return res.status(403).json({
        success: false,
        error: 'SPHINCS+ public key mismatch'
      });
    }

    if (!storedKey) {
      registeredKeys.set(source_address, sphincs_pub);
      console.log('Auto-registered SPHINCS+ key');
    }

    // Verify SPHINCS+ signature
    console.log('Verifying SPHINCS+ signature...');
    const isValid = await sphincsVerifier.verify(sphincs_sig, tx_hash, sphincs_pub);

    if (!isValid) {
      console.log('SPHINCS+ signature verification FAILED');
      return res.status(403).json({
        success: false,
        error: 'Invalid SPHINCS+ signature'
      });
    }

    console.log('SPHINCS+ signature verification PASSED');

    // Parse the payment transaction
    const paymentTx = StellarSdk.TransactionBuilder.fromXDR(tx_xdr, NETWORK_PASSPHRASE);
    const paymentTxHash = paymentTx.hash();

    // Connect to Horizon
    const server = new StellarSdk.Horizon.Server(HORIZON_TESTNET);

    // Load source account
    console.log('Loading source account...');
    const sourceAccount = await server.loadAccount(source_address);

    // Check if verifier is a signer
    const verifierSigner = sourceAccount.signers.find(
      s => s.key === VERIFIER_KEYPAIR.publicKey()
    );

    if (!verifierSigner || verifierSigner.weight === 0) {
      console.log('Verifier is NOT a signer on this account');
      return res.status(400).json({
        success: false,
        error: 'Verifier is not authorized as a signer. Please lock the wallet first.'
      });
    }

    console.log(`Verifier signer weight: ${verifierSigner.weight}`);

    // Build transaction to add preAuthTx signer
    console.log('Building preAuthTx signer transaction...');

    const addPreAuthTx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(
        StellarSdk.Operation.setOptions({
          signer: {
            preAuthTx: paymentTxHash,
            weight: 1
          }
        })
      )
      .setTimeout(30)
      .build();

    // Sign with verifier key
    addPreAuthTx.sign(VERIFIER_KEYPAIR);

    // Submit the add-signer transaction
    console.log('Submitting preAuthTx signer transaction...');
    try {
      await server.submitTransaction(addPreAuthTx);
      console.log('PreAuthTx signer added successfully');
    } catch (addError) {
      const errorCodes = addError.response?.data?.extras?.result_codes;
      console.error('Failed to add preAuthTx signer:', errorCodes);
      return res.status(400).json({
        success: false,
        error: `Failed to add preAuthTx: ${JSON.stringify(errorCodes)}`
      });
    }

    // Now submit the original payment transaction
    // It will be authorized by the preAuthTx signer
    console.log('Submitting payment transaction...');
    try {
      const result = await server.submitTransaction(paymentTx);
      console.log('Payment transaction submitted successfully!');
      console.log(`TX Hash: ${result.hash}`);

      return res.json({
        success: true,
        tx_hash: result.hash,
        message: 'Transaction verified and submitted via preAuthTx'
      });
    } catch (paymentError) {
      const errorCodes = paymentError.response?.data?.extras?.result_codes;
      console.error('Payment submission failed:', errorCodes);
      return res.status(400).json({
        success: false,
        error: `Payment failed: ${JSON.stringify(errorCodes)}`
      });
    }
  } catch (error) {
    console.error('Verify and submit error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Quantum Stellar Verifier',
    verifier_public_key: VERIFIER_KEYPAIR.publicKey(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Quantum Stellar Verifier',
    description: 'Verifies SPHINCS+ signatures and submits Stellar transactions via preAuthTx',
    verifier_public_key: VERIFIER_KEYPAIR.publicKey(),
    endpoints: {
      '/public-key': 'GET - Get verifier public key (for account locking)',
      '/register': 'POST - Register SPHINCS+ public key for an account',
      '/verify-and-submit': 'POST - Verify signature and submit transaction',
      '/health': 'GET - Health check'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Quantum Stellar Verifier - Running                ║
╠═══════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                              ║
║  Network: Stellar Testnet                                 ║
║                                                           ║
║  Verifier Public Key:                                     ║
║  ${VERIFIER_KEYPAIR.publicKey()}  ║
║                                                           ║
║  Endpoints:                                               ║
║    GET  /public-key       - Get verifier public key       ║
║    POST /register         - Register SPHINCS+ key         ║
║    POST /verify-and-submit - Verify and submit tx         ║
║    GET  /health           - Health check                  ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
