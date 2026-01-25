#!/usr/bin/env node

/**
 * Quick test of SPHINCS+ signing performance
 */

// Simulate browser crypto
const crypto = require('crypto').webcrypto;
global.crypto = crypto;

console.log('Building extension...');
require('child_process').execSync('cd extension && npm run build', { stdio: 'inherit' });

console.log('\nTesting SPHINCS+ implementation...\n');

async function testSigning() {
  // Load the built module
  const fs = require('fs');
  const vm = require('vm');
  
  // Read and execute the built code
  const code = fs.readFileSync('./extension/dist/background.js', 'utf8');
  const context = {
    console,
    crypto,
    Buffer,
    TextEncoder,
    TextDecoder,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    process,
    require,
    module: { exports: {} },
    exports: {},
  };
  
  vm.createContext(context);
  vm.runInContext(code, context);
  
  console.log('1. Generating keypair...');
  const start1 = Date.now();
  
  // This will fail because we can't easily import from webpack bundle
  // Let me try a different approach
  
}

testSigning().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
