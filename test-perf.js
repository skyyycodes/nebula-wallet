const crypto = require('crypto').webcrypto;
const { shake256 } = require('@noble/hashes/sha3.js');

// SPHINCS+ parameters
const N = 16;
const W = 16;
const D = 20;
const HP = 3;
const A = 9;
const K = 30;
const LEN = 35;

console.log('=== SPHINCS+ Signing Performance Test ===\n');
console.log('Parameters:');
console.log(`  N=${N}, W=${W}, D=${D}, HP=${HP}, A=${A}, K=${K}, LEN=${LEN}`);
console.log(`  Expected signature size: ${N + K * (1 + A) * N + D * (LEN + HP) * N} bytes\n`);

// Test WOTS+ signing time (this is done LEN=35 times per layer)
console.log('Testing WOTS+ chain (single iteration)...');
const testData = new Uint8Array(16);
crypto.getRandomValues(testData);

const iterations = 100;
const start = Date.now();
for (let i = 0; i < iterations; i++) {
  shake256(testData, { dkLen: 16 });
}
const elapsed = Date.now() - start;
console.log(`  ${iterations} SHAKE256 hashes: ${elapsed}ms (${(elapsed/iterations).toFixed(2)}ms each)`);

// Estimate WOTS+ signature time
const wotsChainLen = 8; // Average chain length for W=16
const wotsHashesPerSig = LEN * wotsChainLen; // 35 * 8 = 280 hashes
const wotsTimeEstimate = (wotsHashesPerSig * elapsed / iterations);
console.log(`  Estimated WOTS+ sig time: ${wotsTimeEstimate.toFixed(0)}ms (${wotsHashesPerSig} hashes)\n`);

// Estimate FORS signing time
const forsHashesPerSig = K * (A + 1); // 30 * 10 = 300 hashes for leaves + auth paths
const forsTimeEstimate = (forsHashesPerSig * elapsed / iterations);
console.log(`Testing FORS estimation...`);
console.log(`  Estimated FORS sig time: ${forsTimeEstimate.toFixed(0)}ms (${forsHashesPerSig} hashes)\n`);

// Estimate Hypertree signing time
const htHashesPerLayer = wotsHashesPerSig + (HP * 2); // WOTS sig + auth path computation
const htTotalHashes = D * htHashesPerLayer; // 20 layers
const htTimeEstimate = (htTotalHashes * elapsed / iterations);
console.log(`Testing Hypertree estimation...`);
console.log(`  Estimated HT sig time: ${htTimeEstimate.toFixed(0)}ms (${htTotalHashes} hashes across ${D} layers)\n`);

// Total estimate
const totalEstimate = forsTimeEstimate + htTimeEstimate;
console.log('=== TOTAL SIGNING TIME ESTIMATE ===');
console.log(`  ${totalEstimate.toFixed(0)}ms (~${(totalEstimate/1000).toFixed(1)}s)`);
console.log();

// Estimate key generation time
const keygenLeaves = 1; // We only compute 1 leaf + auth path in simplified version
const keygenHashes = wotsHashesPerSig + HP * 2;
const keygenEstimate = (keygenHashes * elapsed / iterations);
console.log('=== KEY GENERATION TIME ESTIMATE ===');
console.log(`  ${keygenEstimate.toFixed(0)}ms (~${(keygenEstimate/1000).toFixed(1)}s) with simplified root\n`);

if (totalEstimate > 10000) {
  console.log('⚠️  WARNING: Signing will take >10 seconds!');
  console.log('⚠️  This is too slow for practical use.');
  console.log('⚠️  The contract will likely hit Budget ExceededLimit during verification.\n');
}

if (totalEstimate > 5000) {
  console.log('⚠️  Signing time is high (>5s). This may cause issues.');
} else {
  console.log('✓ Signing time looks reasonable (<5s)');
}
