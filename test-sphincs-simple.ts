/**
 * Test new SPHINCS+ implementation
 */

import { getSphincsModule, uint8ArrayToHex } from './extension/src/sphincs';

async function test() {
  console.log('=== Testing New SPHINCS+ Implementation ===\n');
  
  console.log('1. Loading module...');
  const sphincs = await getSphincsModule();
  console.log('   ✓ Loaded\n');
  
  console.log('2. Generating keypair...');
  const start = Date.now();
  const keyPair = await sphincs.generateKeyPair();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  
  console.log(`   ✓ Generated in ${elapsed}s`);
  console.log(`   Public key (${keyPair.publicKey.length} bytes):`, uint8ArrayToHex(keyPair.publicKey));
  console.log(`   Secret key length: ${keyPair.secretKey.length} bytes\n`);
  
  console.log('3. Signing test message...');
  const message = new Uint8Array(32);
  crypto.getRandomValues(message);
  
  const startSign = Date.now();
  const signature = await sphincs.sign(message, keyPair.secretKey);
  const signElapsed = ((Date.now() - startSign) / 1000).toFixed(2);
  
  console.log(`   ✓ Signed in ${signElapsed}s`);
  console.log(`   Signature length: ${signature.length} bytes`);
  console.log(`   Expected: ${16 + 30 * 10 * 16 + 20 * 38 * 16} bytes\n`);
  
  console.log('=== Test Complete ===');
  console.log(`Key generation: ${elapsed}s`);
  console.log(`Signing: ${signElapsed}s`);
}

test().catch(console.error);
