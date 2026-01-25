/**
 * Test proper SPHINCS+ implementation
 * This tests that signatures are correctly formatted and can be signed
 */

const { getSphincsModule, uint8ArrayToHex, hexToUint8Array } = require('./extension/dist/background.js');

async function testSphincs() {
  console.log('Starting SPHINCS+ proper implementation test...');
  console.log('WARNING: Key generation may take a very long time (hours) due to D=20 layers');
  console.log('');
  
  try {
    const sphincs = await getSphincsModule();
    console.log('SPHINCS+ module loaded');
    
    // Test message
    const message = new TextEncoder().encode('Test message for SPHINCS+');
    console.log('Message:', new TextDecoder().decode(message));
    console.log('');
    
    console.log('Generating key pair... (this will take a VERY long time)');
    console.log('Started at:', new Date().toISOString());
    const startTime = Date.now();
    
    const keyPair = await sphincs.generateKeyPair();
    
    const elapsed = Date.now() - startTime;
    console.log('Key pair generated in', Math.round(elapsed / 1000), 'seconds');
    console.log('Public key:', uint8ArrayToHex(keyPair.publicKey));
    console.log('Public key length:', keyPair.publicKey.length, 'bytes (expected 32)');
    console.log('Secret key length:', keyPair.secretKey.length, 'bytes (expected 64)');
    console.log('');
    
    console.log('Signing message...');
    const signature = await sphincs.sign(message, keyPair.secretKey);
    console.log('Signature length:', signature.length, 'bytes');
    console.log('Expected signature length:', 16 + 30 * (1 + 9) * 16 + 20 * (35 + 3) * 16, 'bytes (should be ~17088)');
    console.log('');
    
    // Check signature structure
    const R = signature.slice(0, 16);
    const forsSigSize = 30 * (1 + 9) * 16; // K * (1 + A) * N
    const forsSig = signature.slice(16, 16 + forsSigSize);
    const htSig = signature.slice(16 + forsSigSize);
    
    console.log('Signature structure:');
    console.log('- R (randomness):', R.length, 'bytes (expected 16)');
    console.log('- FORS signature:', forsSig.length, 'bytes (expected', forsSigSize, ')');
    console.log('- Hypertree signature:', htSig.length, 'bytes (expected', 20 * (35 + 3) * 16, ')');
    console.log('');
    
    if (signature.length === 16 + forsSigSize + 20 * (35 + 3) * 16) {
      console.log('✓ Signature has correct length!');
    } else {
      console.log('✗ Signature length mismatch!');
    }
    
    // Verify signature (not implemented in TS, but check it doesn't error)
    const valid = await sphincs.verify(signature, message, keyPair.publicKey);
    console.log('Verification (placeholder):', valid);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

testSphincs();
