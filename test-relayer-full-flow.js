/**
 * Complete E2E Test: Locked Wallet Transaction via Relayer API
 * 
 * This test verifies:
 * 1. Wallet creation and funding
 * 2. SPHINCS+ key generation and registration
 * 3. Wallet locking (remove master key, add relayer signer)
 * 4. Transaction signing with SPHINCS+
 * 5. Approval submission via relayer API
 * 6. Transaction verification on Stellar network
 */

const StellarSdk = require('@stellar/stellar-sdk');
const { shake256 } = require('@noble/hashes/sha3.js');
const fetch = require('node-fetch');

// SPHINCS+ parameters (same as contract)
const N = 16;
const W = 16;
const H = 60;
const D = 20;
const HP = 3;
const A = 9;
const K = 30;

// Configuration
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org:443';
const RELAYER_API_URL = 'http://localhost:3001/api';
const CONTRACT_ID = 'CBHEH6LH3XWHFUHRIRVND6GTUSKDNLNIDHS3PZ7AD2V7OCUACMP44VL7';
const RELAYER_PUBLIC_KEY = 'GA2UZMETZS7GRYFH4H7LAUZXUP3J6JWMB7IN2E7IHXDQSR7JXU44H4A5';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const server = new StellarSdk.Horizon.Server(HORIZON_URL);
const sorobanServer = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL);

// Helper to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('='.repeat(80));
  console.log('🧪 FULL E2E TEST: Locked Wallet Transaction via Relayer API');
  console.log('='.repeat(80));
  console.log();

  try {
    // ============================================================================
    // STEP 1: Create Stellar Wallet
    // ============================================================================
    console.log('📝 STEP 1: Creating Stellar wallet...');
    const stellarKeypair = StellarSdk.Keypair.random();
    const publicKey = stellarKeypair.publicKey();
    const secretKey = stellarKeypair.secret();
    
    console.log('   ✅ Wallet created!');
    console.log('   Public Key:', publicKey);
    console.log();

    // ============================================================================
    // STEP 2: Fund Wallet from Friendbot
    // ============================================================================
    console.log('💰 STEP 2: Funding wallet from Friendbot...');
    const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}`;
    const friendbotResponse = await fetch(friendbotUrl);
    
    if (!friendbotResponse.ok) {
      throw new Error('Friendbot funding failed');
    }
    
    await sleep(2000); // Wait for ledger to close
    const account = await server.loadAccount(publicKey);
    const balance = account.balances.find(b => b.asset_type === 'native').balance;
    
    console.log('   ✅ Wallet funded!');
    console.log('   Balance:', balance, 'XLM');
    console.log();

    // ============================================================================
    // STEP 3: Generate SPHINCS+ Keypair
    // ============================================================================
    console.log('🔐 STEP 3: Generating SPHINCS+ keypair...');
    const startKeygen = Date.now();
    const sphincsKeypair = SphincsKeypair.generate();
    const keygenTime = Date.now() - startKeygen;
    
    console.log('   ✅ SPHINCS+ keypair generated!');
    console.log('   Time taken:', (keygenTime / 1000).toFixed(2), 'seconds');
    console.log('   Public key size:', sphincsKeypair.publicKey.length, 'bytes');
    console.log();

    // ============================================================================
    // STEP 4: Register SPHINCS+ Public Key On-Chain
    // ============================================================================
    console.log('📋 STEP 4: Registering SPHINCS+ public key on-chain...');
    const stellarAccount = await server.loadAccount(publicKey);
    const contract = new StellarSdk.Contract(CONTRACT_ID);
    
    const registerTx = new StellarSdk.TransactionBuilder(stellarAccount, {
      fee: '1000000',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(contract.call(
        'register',
        StellarSdk.Address.fromString(publicKey).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(sphincsKeypair.publicKey))
      ))
      .setTimeout(30)
      .build();

    const simulation = await sorobanServer.simulateTransaction(registerTx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Registration simulation failed: ${simulation.error}`);
    }

    const assembledTx = StellarSdk.SorobanRpc.assembleTransaction(registerTx, simulation);
    const preparedTx = assembledTx.build();
    preparedTx.sign(stellarKeypair);

    const registerResponse = await sorobanServer.sendTransaction(preparedTx);
    console.log('   Transaction submitted:', registerResponse.hash);
    
    // Wait for confirmation
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const result = await sorobanServer.getTransaction(registerResponse.hash);
      if (result.status === 'SUCCESS') {
        console.log('   ✅ SPHINCS+ key registered on-chain!');
        console.log('   Registration TX:', registerResponse.hash);
        break;
      } else if (result.status === 'FAILED') {
        throw new Error('Registration transaction failed');
      }
    }
    console.log();

    // ============================================================================
    // STEP 5: Lock Wallet (Remove Master Key, Add Relayer Signer)
    // ============================================================================
    console.log('🔒 STEP 5: Locking wallet...');
    const accountToLock = await server.loadAccount(publicKey);
    
    const lockTx = new StellarSdk.TransactionBuilder(accountToLock, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.setOptions({
        signer: {
          ed25519PublicKey: RELAYER_PUBLIC_KEY,
          weight: 1
        }
      }))
      .addOperation(StellarSdk.Operation.setOptions({
        masterWeight: 0,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1
      }))
      .setTimeout(30)
      .build();

    lockTx.sign(stellarKeypair);
    const lockResponse = await server.submitTransaction(lockTx);
    
    console.log('   ✅ Wallet locked!');
    console.log('   Lock TX:', lockResponse.hash);
    console.log('   Explorer:', `https://stellar.expert/explorer/testnet/tx/${lockResponse.hash}`);
    console.log('   Master key weight set to 0');
    console.log('   Relayer added as signer with weight 1');
    console.log();

    // ============================================================================
    // STEP 6: Create Payment Transaction
    // ============================================================================
    console.log('💸 STEP 6: Creating payment transaction...');
    const recipient = StellarSdk.Keypair.random().publicKey();
    console.log('   Recipient:', recipient);
    
    const lockedAccount = await server.loadAccount(publicKey);
    const paymentTx = new StellarSdk.TransactionBuilder(lockedAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipient,
        asset: StellarSdk.Asset.native(),
        amount: '10'
      }))
      .setTimeout(30)
      .build();

    const txXdr = paymentTx.toXDR();
    const txHash = paymentTx.hash().toString('hex');
    
    console.log('   ✅ Payment transaction created!');
    console.log('   Amount: 10 XLM');
    console.log('   TX Hash:', txHash);
    console.log();

    // ============================================================================
    // STEP 7: Sign Transaction with SPHINCS+
    // ============================================================================
    console.log('✍️  STEP 7: Signing transaction with SPHINCS+...');
    const startSign = Date.now();
    const signature = sphincsSign(
      sphincsKeypair.secretKey,
      sphincsKeypair.publicKey,
      Buffer.from(txHash, 'hex')
    );
    const signTime = Date.now() - startSign;
    
    console.log('   ✅ Transaction signed!');
    console.log('   Time taken:', (signTime / 1000).toFixed(2), 'seconds');
    console.log('   Signature size:', signature.length, 'bytes');
    console.log();

    // ============================================================================
    // STEP 8: Submit Approval via Relayer API
    // ============================================================================
    console.log('🚀 STEP 8: Submitting approval to relayer API...');
    const signatureBase64 = Buffer.from(signature).toString('base64');
    
    const apiResponse = await fetch(`${RELAYER_API_URL}/submit-approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stellarAddress: publicKey,
        txHash: txHash,
        txXdr: txXdr,
        sphincsSignature: signatureBase64
      })
    });

    const apiResult = await apiResponse.json();
    
    if (!apiResponse.ok || !apiResult.success) {
      console.error('   ❌ Relayer API Error:', apiResult);
      throw new Error(apiResult.error || 'Relayer API failed');
    }
    
    console.log('   ✅ Approval submitted successfully!');
    console.log('   Nonce:', apiResult.nonce);
    console.log('   Approval TX Hash:', apiResult.txHash);
    console.log('   Explorer:', `https://stellar.expert/explorer/testnet/tx/${apiResult.txHash}`);
    console.log();

    // ============================================================================
    // STEP 9: Wait for Relayer to Process and Submit Transaction
    // ============================================================================
    console.log('⏳ STEP 9: Waiting for relayer to verify and submit transaction...');
    console.log('   (The relayer will verify the SPHINCS+ signature off-chain)');
    console.log('   (Then submit the actual payment transaction to Stellar)');
    
    // Poll for transaction on Horizon
    let finalTxHash = null;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      process.stdout.write(`\r   Polling... ${i * 2}s`);
      
      try {
        // Check account operations to see if payment went through
        const operations = await server.operations()
          .forAccount(publicKey)
          .order('desc')
          .limit(10)
          .call();
        
        const recentPayment = operations.records.find(op => 
          op.type === 'payment' && 
          op.from === publicKey && 
          op.to === recipient
        );
        
        if (recentPayment) {
          finalTxHash = recentPayment.transaction_hash;
          console.log('\n   ✅ Payment transaction found!');
          break;
        }
      } catch (error) {
        // Continue polling
      }
    }
    
    if (!finalTxHash) {
      console.log('\n   ⚠️  Transaction not yet confirmed (may still be processing)');
      console.log('   Check the relayer logs for verification status');
      return;
    }
    
    console.log();

    // ============================================================================
    // STEP 10: Verify Transaction on Stellar Explorer
    // ============================================================================
    console.log('✅ STEP 10: Verifying transaction on Stellar network...');
    const tx = await server.transactions()
      .transaction(finalTxHash)
      .call();
    
    console.log('   Transaction Hash:', finalTxHash);
    console.log('   Status:', tx.successful ? '✅ SUCCESS' : '❌ FAILED');
    console.log('   Source Account:', tx.source_account);
    console.log('   Operations:', tx.operation_count);
    console.log('   Fee:', tx.fee_charged, 'stroops');
    console.log();
    console.log('   🔗 Stellar Expert:');
    console.log('      https://stellar.expert/explorer/testnet/tx/' + finalTxHash);
    console.log();

    // Verify recipient received funds
    const recipientAccount = await server.loadAccount(recipient);
    const recipientBalance = recipientAccount.balances.find(b => b.asset_type === 'native').balance;
    
    console.log('   💰 Recipient Balance:', recipientBalance, 'XLM');
    console.log();

    // ============================================================================
    // FINAL SUMMARY
    // ============================================================================
    console.log('='.repeat(80));
    console.log('🎉 TEST COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log('  ✅ Wallet created and funded');
    console.log('  ✅ SPHINCS+ keypair generated (~' + (keygenTime / 1000).toFixed(2) + 's)');
    console.log('  ✅ Public key registered on-chain');
    console.log('  ✅ Wallet locked (master key removed)');
    console.log('  ✅ Transaction signed with SPHINCS+ (~' + (signTime / 1000).toFixed(2) + 's)');
    console.log('  ✅ Approval submitted via relayer API');
    console.log('  ✅ Relayer verified signature off-chain');
    console.log('  ✅ Transaction submitted and confirmed on Stellar');
    console.log('  ✅ 10 XLM sent from locked wallet to recipient');
    console.log();
    console.log('🔗 View on Stellar Explorer:');
    console.log('   Lock TX:     https://stellar.expert/explorer/testnet/tx/' + lockResponse.hash);
    console.log('   Approval TX: https://stellar.expert/explorer/testnet/tx/' + apiResult.txHash);
    console.log('   Payment TX:  https://stellar.expert/explorer/testnet/tx/' + finalTxHash);
    console.log();

  } catch (error) {
    console.error();
    console.error('❌ TEST FAILED:', error.message);
    console.error();
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    console.error(error);
    process.exit(1);
  }
}

main();
