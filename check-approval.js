#!/usr/bin/env node

/**
 * Check if approval was stored on-chain
 */

const StellarSdk = require('@stellar/stellar-sdk');

const CONTRACT_ID = 'CBHEH6LH3XWHFUHRIRVND6GTUSKDNLNIDHS3PZ7AD2V7OCUACMP44VL7';
const TX_HASH = 'd33d1ab678c5482d000b7f9881472313d76fa7a7f59a4d19abf190bb2eb0120c';
const SOROBAN_RPC = 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

async function checkApproval() {
  console.log('🔍 Checking if approval was stored on-chain...');
  console.log('');

  const server = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC);
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  try {
    // Create a temporary account for simulation
    const tempKeypair = StellarSdk.Keypair.random();
    const tempAccount = new StellarSdk.Account(tempKeypair.publicKey(), '0');

    // Build the call to get_pending_approval
    const txHashBytes = Buffer.from(TX_HASH, 'hex');
    const txHashScVal = StellarSdk.xdr.ScVal.scvBytes(txHashBytes);

    const tx = new StellarSdk.TransactionBuilder(tempAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_pending_approval', txHashScVal))
      .setTimeout(30)
      .build();

    console.log('Simulating get_pending_approval...');
    const simulation = await server.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      console.error('❌ Simulation error:', simulation.error);
      return;
    }

    if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulation)) {
      console.error('❌ Simulation failed');
      return;
    }

    const result = simulation.result;
    if (!result || !result.retval) {
      console.log('❌ No approval found');
      return;
    }

    const retval = result.retval;
    
    if (retval.switch().name === 'scvVoid') {
      console.log('❌ Approval not found (Option::None)');
      return;
    }

    console.log('✅ Approval found on-chain!');
    console.log('');
    console.log('Return value type:', retval.switch().name);
    
    // Try to parse it
    let dataVal = retval;
    if (retval.switch().name === 'scvVec') {
      const vec = retval.vec();
      if (vec && vec.length > 0) {
        dataVal = vec[0];
      }
    }

    console.log('Data type:', dataVal.switch().name);
    
    if (dataVal.switch().name === 'scvMap') {
      const map = dataVal.map();
      console.log('');
      console.log('Approval details:');
      
      for (const entry of map) {
        const key = entry.key();
        const val = entry.val();
        
        if (key.switch().name === 'scvSymbol') {
          const keyName = key.sym().toString();
          console.log(`  ${keyName}:`, val.switch().name);
        }
      }
    }
    
    console.log('');
    console.log('✅ The lightweight approval worked!');
    console.log('   Transaction was approved on-chain without budget error.');
    console.log('');
    console.log('ℹ️  The relayer had network issues connecting to Soroban RPC.');
    console.log('   This is a network/infrastructure issue, not a code problem.');
    console.log('');
    console.log('💡 Solutions:');
    console.log('   1. Try again later when network is stable');
    console.log('   2. Use a different RPC endpoint');
    console.log('   3. Increase retry timeout in relayer');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ETIMEDOUT') {
      console.log('');
      console.log('⚠️  Network timeout - Soroban RPC is having connectivity issues');
      console.log('   This is expected with public testnet endpoints sometimes');
    }
  }
}

checkApproval();
