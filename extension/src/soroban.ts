/**
 * Soroban Contract Integration
 *
 * Handles interaction with the on-chain SPHINCS+ verifier contract
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkManager } from './modules/network/NetworkManager';

// Contract ID - Quantum-Safe Verifier Contract (Deployed)
// Updated: 2026-01-25 - New quantum deployer contract
let CONTRACT_ID = 'CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW';

// Relayer public key - needed for wallet locking
export const RELAYER_PUBLIC_KEY = 'GA2UZMETZS7GRYFH4H7LAUZXUP3J6JWMB7IN2E7IHXDQSR7JXU44H4A5';

// Relayer API endpoint
// Relayer API endpoint for Soroban contract interactions
const RELAYER_API_URL = 'http://localhost:3001/api'; // Development
// const RELAYER_API_URL = 'https://nebula-ext.vercel.app/api'; // Production

/**
 * Set the contract ID after deployment
 */
export function setContractId(id: string) {
  CONTRACT_ID = id;
}

/**
 * Get the current contract ID
 */
export function getContractId(): string {
  return CONTRACT_ID;
}

/**
 * Create a Soroban RPC server instance
 */
function getServer(): StellarSdk.SorobanRpc.Server {
  const networkManager = getNetworkManager();
  const config = networkManager.getConfig();
  return new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
}

/**
 * Register a SPHINCS+ public key with the on-chain verifier
 */
export async function registerOnChain(
  stellarAddress: string,
  stellarSecretKey: string,
  sphincsPublicKey: Uint8Array
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!CONTRACT_ID) {
    return { success: false, error: 'Contract ID not set' };
  }

  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const server = getServer();
    const keypair = StellarSdk.Keypair.fromSecret(stellarSecretKey);
    const account = await server.getAccount(stellarAddress);

    const contract = new StellarSdk.Contract(CONTRACT_ID);

    // Debug logging
    console.log('registerOnChain - sphincsPublicKey info:', {
      length: sphincsPublicKey.length,
      isUint8Array: sphincsPublicKey instanceof Uint8Array,
      constructorName: sphincsPublicKey.constructor?.name
    });

    // Create address ScVal
    const addressScVal = StellarSdk.Address.fromString(stellarAddress).toScVal();
    console.log('registerOnChain - addressScVal created');

    // Create bytes ScVal using xdr directly
    // Use type assertion since scvBytes accepts Uint8Array at runtime
    const bytesScVal = StellarSdk.xdr.ScVal.scvBytes(new Uint8Array(sphincsPublicKey) as unknown as Buffer);
    console.log('registerOnChain - bytesScVal created, type:', bytesScVal.switch().name);

    // Build the register transaction
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '500000', // 0.05 XLM for Soroban
      networkPassphrase: config.passphrase
    })
      .addOperation(contract.call(
        'register',
        addressScVal,
        bytesScVal
      ))
      .setTimeout(30)
      .build();

    console.log('registerOnChain - transaction built');

    // First simulate to get better error info
    console.log('registerOnChain - simulating transaction...');
    const simulation = await server.simulateTransaction(tx);
    console.log('registerOnChain - simulation result:', JSON.stringify(simulation, null, 2));

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      console.error('Simulation error:', simulation.error);
      return { success: false, error: `Simulation failed: ${simulation.error}` };
    }

    if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulation)) {
      return { success: false, error: 'Simulation did not succeed' };
    }

    // Use assembleTransaction instead of prepareTransaction to avoid parsing issues
    console.log('registerOnChain - assembling transaction...');
    const assembledTx = StellarSdk.SorobanRpc.assembleTransaction(tx, simulation);
    const preparedTx = assembledTx.build();
    preparedTx.sign(keypair);

    // Submit
    const response = await server.sendTransaction(preparedTx);
    console.log('registerOnChain - transaction submitted, status:', response.status, 'hash:', response.hash);

    if (response.status === 'PENDING') {
      // Use Horizon API to check transaction status (workaround for SDK parsing bug)
      console.log('registerOnChain - waiting for confirmation via Horizon...');
      const horizonUrl = `${config.horizonUrl}/transactions/${response.hash}`;

      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const horizonResponse = await fetch(horizonUrl);
          if (horizonResponse.ok) {
            const txData = await horizonResponse.json();
            if (txData.successful) {
              console.log('registerOnChain - transaction confirmed on ledger:', txData.ledger);
              return { success: true, txHash: response.hash };
            } else {
              return { success: false, error: 'Transaction failed on-chain' };
            }
          }
        } catch {
          // Transaction not yet on Horizon, keep waiting
        }
      }

      return { success: false, error: 'Transaction confirmation timeout' };
    }

    return { success: false, error: `Transaction status: ${response.status}` };
  } catch (error) {
    console.error('On-chain registration failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed'
    };
  }
}

/**
 * Verify a SPHINCS+ signature on-chain
 */
export async function verifyOnChain(
  stellarAddress: string,
  txHash: string,
  sphincsSignature: Uint8Array
): Promise<{ success: boolean; isValid?: boolean; error?: string }> {
  if (!CONTRACT_ID) {
    return { success: false, error: 'Contract ID not set' };
  }

  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const server = getServer();

    const contract = new StellarSdk.Contract(CONTRACT_ID);

    // Build a simulation-only transaction to call verify
    // We use a random source account since this is read-only
    const sourceKeypair = StellarSdk.Keypair.random();

    // Create a minimal account for simulation
    const account = new StellarSdk.Account(sourceKeypair.publicKey(), '0');

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: config.passphrase
    })
      .addOperation(contract.call(
        'verify',
        StellarSdk.Address.fromString(stellarAddress).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(txHash, 'hex')),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(sphincsSignature))
      ))
      .setTimeout(30)
      .build();

    // Simulate the transaction (read-only, no signing needed)
    const simulation = await server.simulateTransaction(tx);

    if ('result' in simulation && simulation.result) {
      // Parse the boolean result
      const resultXdr = simulation.result.retval;
      const isValid = resultXdr.value() === true;
      return { success: true, isValid };
    }

    return { success: false, error: 'Simulation failed' };
  } catch (error) {
    console.error('On-chain verification failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}

/**
 * Verify and authorize a transaction on-chain
 * This submits a real transaction that calls verify_and_auth
 */
export async function verifyAndAuthOnChain(
  stellarAddress: string,
  stellarSecretKey: string,
  txHash: string,
  sphincsSignature: Uint8Array
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!CONTRACT_ID) {
    return { success: false, error: 'Contract ID not set' };
  }

  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const server = getServer();
    const keypair = StellarSdk.Keypair.fromSecret(stellarSecretKey);
    const account = await server.getAccount(stellarAddress);

    const contract = new StellarSdk.Contract(CONTRACT_ID);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: config.passphrase
    })
      .addOperation(contract.call(
        'verify_and_auth',
        StellarSdk.Address.fromString(stellarAddress).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(txHash, 'hex')),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(sphincsSignature))
      ))
      .setTimeout(30)
      .build();

    const preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(keypair);

    const response = await server.sendTransaction(preparedTx);

    if (response.status === 'PENDING') {
      let result = await server.getTransaction(response.hash);
      while (result.status === 'NOT_FOUND') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await server.getTransaction(response.hash);
      }

      if (result.status === 'SUCCESS') {
        return { success: true, txHash: response.hash };
      } else {
        return { success: false, error: 'Authorization failed' };
      }
    }

    return { success: false, error: 'Transaction not pending' };
  } catch (error) {
    console.error('On-chain auth failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authorization failed'
    };
  }
}

/**
 * Check if an address is registered on-chain
 */
export async function isRegisteredOnChain(
  stellarAddress: string
): Promise<{ success: boolean; isRegistered?: boolean; error?: string }> {
  if (!CONTRACT_ID) {
    return { success: false, error: 'Contract ID not set' };
  }

  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const server = getServer();
    const contract = new StellarSdk.Contract(CONTRACT_ID);

    const sourceKeypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(sourceKeypair.publicKey(), '0');

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: config.passphrase
    })
      .addOperation(contract.call(
        'is_registered',
        StellarSdk.Address.fromString(stellarAddress).toScVal()
      ))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(tx);

    if ('result' in simulation && simulation.result) {
      const isRegistered = simulation.result.retval.value() === true;
      return { success: true, isRegistered };
    }

    return { success: false, error: 'Simulation failed' };
  } catch (error) {
    console.error('Registration check failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Check failed'
    };
  }
}

/**
 * Submit transaction for hybrid approval (via relayer API)
 * The relayer will submit the approval to the contract and return the nonce
 */
export async function submitForHybridApproval(
  stellarAddress: string,
  stellarSecretKey: string,
  txXdr: string,
  txHash: string,
  sphincsSignature: Uint8Array
): Promise<{ 
  success: boolean; 
  nonce?: number; 
  approvalTxHash?: string;
  paymentTxHash?: string;
  error?: string;
}> {
  try {
    // Convert signature to base64 for transmission
    const signatureBase64 = Buffer.from(sphincsSignature).toString('base64');

    console.log('Submitting approval to relayer API...');
    console.log('  Stellar Address:', stellarAddress);
    console.log('  TX Hash:', txHash);
    console.log('  TX XDR length:', txXdr.length);
    console.log('  Signature length:', sphincsSignature.length);

    // Call relayer API
    const response = await fetch(`${RELAYER_API_URL}/submit-approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stellarAddress,
        txHash,
        txXdr,
        sphincsSignature: signatureBase64
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Relayer API error:', result);
      return {
        success: false,
        error: result.error || `Relayer returned status ${response.status}`
      };
    }

    if (result.success) {
      console.log('Approval submitted successfully via relayer');
      console.log('  Approval TX:', result.approvalTxHash);
      console.log('  Payment TX:', result.paymentTxHash);
      return {
        success: true,
        nonce: result.nonce || 0,
        approvalTxHash: result.approvalTxHash,
        paymentTxHash: result.paymentTxHash
      };
    } else {
      return {
        success: false,
        error: result.error || 'Unknown relayer error'
      };
    }

  } catch (error) {
    console.error('Failed to submit to relayer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to contact relayer'
    };
  }
}

/**
 * Check if a transaction approval exists and is valid
 */
export async function checkApprovalStatus(
  txHash: string
): Promise<{ approved: boolean; consumed: boolean; error?: string }> {
  if (!CONTRACT_ID) {
    return { approved: false, consumed: false, error: 'Contract ID not set' };
  }

  try {
    const networkManager = getNetworkManager();
    const config = networkManager.getConfig();
    const server = getServer();
    const contract = new StellarSdk.Contract(CONTRACT_ID);

    // Use a random account for simulation
    const sourceKeypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(sourceKeypair.publicKey(), '0');

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: config.passphrase
    })
      .addOperation(contract.call(
        'is_approved',
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(txHash, 'hex'))
      ))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(tx);

    if ('result' in simulation && simulation.result) {
      const approved = simulation.result.retval.value() === true;
      return { approved, consumed: false };
    }

    return { approved: false, consumed: false, error: 'Simulation failed' };
  } catch (error) {
    console.error('Approval status check failed:', error);
    return {
      approved: false,
      consumed: false,
      error: error instanceof Error ? error.message : 'Check failed'
    };
  }
}
