#!/usr/bin/env node

/**
 * Quick Test: Submit approval to trigger relayer
 * This uses an already locked wallet to test the relayer flow
 */

const StellarSdk = require('@stellar/stellar-sdk');

// Use the wallet from the previous test
const TEST_ADDRESS = 'GCQUZR4E4YQG37XKV4WCLMAEVPABABQWEJODLUMG7TKDGT6FMR4ZZNRE';
const TEST_SECRET = 'SCBNYR6W5AS47ZFOEYTNPZ57ZE44VSCNOCNB7T6QGZQOVZZCY3KFSXCL';
const CONTRACT_ID = 'CBHEH6LH3XWHFUHRIRVND6GTUSKDNLNIDHS3PZ7AD2V7OCUACMP44VL7';
const SOROBAN_RPC = 'https://soroban-testnet.stellar.org:443';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

async function quickTest() {
  console.log('🔄 Quick Relayer Test');
  console.log('');
  console.log('This will submit an approval to test the relayer...');
  console.log('');

  const server = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC);
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const keypair = StellarSdk.Keypair.fromSecret(TEST_SECRET);

  try {
    // Create a simple payment transaction
    console.log('📤 Creating test transaction...');
    const account = await horizon.loadAccount(TEST_ADDRESS);
    const recipient = StellarSdk.Keypair.random();
    
    const paymentTx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipient.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '5'
      }))
      .setTimeout(300)
      .build();

    const txHash = paymentTx.hash();
    console.log('   TX Hash:', txHash.toString('hex'));
    console.log('   Recipient:', recipient.publicKey());
    console.log('');

    // Create a dummy SPHINCS+ signature (just for testing relayer flow)
    const dummySignature = Buffer.alloc(16976);
    dummySignature[0] = 0xAB; // Mark as dummy
    
    console.log('✅ Submitting for approval...');
    const account2 = await server.getAccount(TEST_ADDRESS);
    const contract = new StellarSdk.Contract(CONTRACT_ID);
    
    const approvalTx = new StellarSdk.TransactionBuilder(account2, {
      fee: '500000',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(contract.call(
        'approve_transaction_lightweight',
        StellarSdk.Address.fromString(TEST_ADDRESS).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(txHash),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(paymentTx.toXDR(), 'base64')),
        StellarSdk.xdr.ScVal.scvBytes(dummySignature)
      ))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(approvalTx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Simulation failed: ${simulation.error}`);
    }

    const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(approvalTx, simulation).build();
    preparedTx.sign(keypair);

    const response = await server.sendTransaction(preparedTx);
    console.log('   ✓ Approval submitted:', response.hash);
    console.log('');
    
    console.log('👀 Watch the relayer terminal for the approval event!');
    console.log('');
    console.log('The relayer should:');
    console.log('  1. Detect the approval event');
    console.log('  2. Fetch the pending approval from contract');
    console.log('  3. Verify SPHINCS+ signature (will fail - dummy signature)');
    console.log('  4. Reject the transaction');
    console.log('');
    console.log('✅ Test completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

quickTest();
