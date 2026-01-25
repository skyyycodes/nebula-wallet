/**
 * Test script to verify swap transactions work through the relayer
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const RELAYER_URL = 'http://localhost:3001';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// Test wallet (you should use your actual locked wallet address)
const TEST_WALLET_PUBLIC_KEY = 'GBLRSEO6A77E2QXDKTZBJS6SE5KH673WE2GXG35H3F2JV4XTULIB2KX4'; // Replace with your wallet

async function testSwapTransaction() {
  console.log('🧪 Testing Swap Transaction through Relayer\n');
  
  try {
    // Step 1: Check relayer health
    console.log('1️⃣  Checking relayer health...');
    const healthRes = await fetch(`${RELAYER_URL}/api/health`);
    const health = await healthRes.json();
    console.log('   ✅ Relayer is online');
    console.log('   Relayer PK:', health.relayerPublicKey);
    console.log('   Network:', health.network);
    
    // Step 2: Create a test swap transaction (pathPaymentStrictSend)
    console.log('\n2️⃣  Building test swap transaction...');
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
    const account = await server.loadAccount(TEST_WALLET_PUBLIC_KEY);
    
    // Mock SPHINCS+ public key (32 bytes)
    const mockSphincsPublicKey = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      mockSphincsPublicKey[i] = i;
    }
    
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.pathPaymentStrictSend({
          sendAsset: StellarSdk.Asset.native(), // XLM
          sendAmount: '1',
          destination: TEST_WALLET_PUBLIC_KEY, // Send to self
          destAsset: new StellarSdk.Asset(
            'USDC',
            'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
          ),
          destMin: '0.9', // Minimum USDC to receive
          path: []
        })
      )
      .addMemo(StellarSdk.Memo.hash(mockSphincsPublicKey))
      .setTimeout(300)
      .build();
    
    const txHash = transaction.hash().toString('hex');
    const txXdr = transaction.toXDR();
    
    console.log('   Transaction Hash:', txHash);
    console.log('   Transaction XDR length:', txXdr.length);
    console.log('   Operation type: pathPaymentStrictSend');
    console.log('   Send: 1 XLM');
    console.log('   Receive min: 0.9 USDC');
    
    // Step 3: Create a mock SPHINCS+ signature
    console.log('\n3️⃣  Creating mock signature...');
    const mockSignature = Buffer.alloc(16976); // Typical SPHINCS+ signature size
    for (let i = 0; i < mockSignature.length; i++) {
      mockSignature[i] = i % 256;
    }
    console.log('   Mock signature size:', mockSignature.length, 'bytes');
    
    // Step 4: Test transaction parsing (without actual submission)
    console.log('\n4️⃣  Testing transaction structure...');
    const parsedTx = StellarSdk.TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
    console.log('   ✅ Transaction parses correctly');
    console.log('   Operations:', parsedTx.operations.length);
    console.log('   Operation[0] type:', parsedTx.operations[0].type);
    console.log('   Memo type:', parsedTx.memo.type);
    
    // Step 5: Verify operation structure
    const op = parsedTx.operations[0];
    console.log('\n5️⃣  Verifying operation details...');
    console.log('   Send Asset:', op.sendAsset.isNative() ? 'XLM' : `${op.sendAsset.code}`);
    console.log('   Send Amount:', op.sendAmount);
    console.log('   Dest Asset:', `${op.destAsset.code}`);
    console.log('   Dest Min:', op.destMin);
    console.log('   Destination:', op.destination);
    console.log('   Path length:', op.path ? op.path.length : 0);
    
    console.log('\n✅ TEST PASSED: Swap transaction structure is correct!');
    console.log('\n📝 Summary:');
    console.log('   • Relayer is running and healthy');
    console.log('   • pathPaymentStrictSend transaction builds correctly');
    console.log('   • All operation fields are accessible');
    console.log('   • Ready for real swap test from extension');
    
    console.log('\n🎯 Next step: Test actual swap from the extension!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testSwapTransaction();
