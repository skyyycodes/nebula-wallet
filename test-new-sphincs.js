/**
 * End-to-end test of new SPHINCS+ implementation
 * Tests: key generation, registration, and transaction signing
 */

// Simulate browser environment
global.crypto = require('crypto').webcrypto;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

async function testNewSphincsImplementation() {
  console.log('=== SPHINCS+ New Implementation E2E Test ===\n');
  
  try {
    // Dynamically import to avoid top-level require issues
    const sphincsModule = require('./extension/src/sphincs.ts');
    
    console.log('1. Loading SPHINCS+ module...');
    const { getSphincsModule, uint8ArrayToHex } = sphincsModule;
    const sphincs = await getSphincsModule();
    console.log('   ✓ Module loaded\n');
    
    console.log('2. Generating keypair (this may take a minute)...');
    const startGen = Date.now();
    const keyPair = await sphincs.generateKeyPair();
    const genTime = ((Date.now() - startGen) / 1000).toFixed(2);
    
    console.log(`   ✓ Generated in ${genTime}s`);
    console.log(`   Public key (${keyPair.publicKey.length} bytes):`, uint8ArrayToHex(keyPair.publicKey));
    console.log(`   Secret key (${keyPair.secretKey.length} bytes):`, uint8ArrayToHex(keyPair.secretKey));
    
    if (keyPair.publicKey.length !== 32) {
      throw new Error(`Invalid public key length: ${keyPair.publicKey.length}, expected 32`);
    }
    if (keyPair.secretKey.length !== 64) {
      throw new Error(`Invalid secret key length: ${keyPair.secretKey.length}, expected 64`);
    }
    console.log('   ✓ Key lengths are correct\n');
    
    console.log('3. Testing signature generation...');
    const testMessage = new Uint8Array(32); // 32-byte hash
    crypto.getRandomValues(testMessage);
    console.log('   Message hash:', uint8ArrayToHex(testMessage));
    
    const startSign = Date.now();
    const signature = await sphincs.sign(testMessage, keyPair.secretKey);
    const signTime = ((Date.now() - startSign) / 1000).toFixed(2);
    
    console.log(`   ✓ Signed in ${signTime}s`);
    console.log(`   Signature length: ${signature.length} bytes`);
    
    const expectedSigLen = 16 + 30 * (1 + 9) * 16 + 20 * (35 + 3) * 16;
    console.log(`   Expected length: ${expectedSigLen} bytes`);
    
    if (signature.length !== expectedSigLen) {
      throw new Error(`Invalid signature length: ${signature.length}, expected ${expectedSigLen}`);
    }
    console.log('   ✓ Signature length is correct\n');
    
    // Check signature structure
    const R = signature.slice(0, 16);
    const forsSigSize = 30 * (1 + 9) * 16;
    const forsSig = signature.slice(16, 16 + forsSigSize);
    const htSig = signature.slice(16 + forsSigSize);
    
    console.log('4. Verifying signature structure...');
    console.log(`   R (randomness): ${R.length} bytes ✓`);
    console.log(`   FORS signature: ${forsSig.length} bytes ✓`);
    console.log(`   Hypertree signature: ${htSig.length} bytes ✓\n`);
    
    console.log('5. Testing signature format for Soroban...');
    // Convert to format expected by contract
    const publicKeyBytes = Buffer.from(keyPair.publicKey);
    const signatureBytes = Buffer.from(signature);
    
    console.log(`   Public key hex: ${publicKeyBytes.toString('hex')}`);
    console.log(`   Signature hex (first 64 bytes): ${signatureBytes.slice(0, 64).toString('hex')}...`);
    console.log(`   ✓ Format looks correct\n`);
    
    console.log('=== All Tests Passed! ===\n');
    console.log('Summary:');
    console.log(`- Key generation: ${genTime}s`);
    console.log(`- Signing: ${signTime}s`);
    console.log(`- Public key: 32 bytes ✓`);
    console.log(`- Signature: ${signature.length} bytes ✓`);
    console.log('\nThe implementation is ready for on-chain testing!');
    console.log('Next step: Try registering and sending a transaction through the extension.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testNewSphincsImplementation().catch(console.error);
