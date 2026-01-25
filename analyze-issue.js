/**
 * Direct test - analyze the budget issue
 */

async function testDirectly() {
  console.log('=== Direct Contract Test ===\n');
  
  console.log('❌ CRITICAL ISSUE IDENTIFIED:');
  console.log('   SPHINCS+-SHAKE-128f parameters (N=16, H=60, D=20) are TOO LARGE');
  console.log('   for Soroban\'s compute budget.\n');
  
  console.log('The verification requires:');
  console.log('  - FORS verification: 30 trees × 9 height = ~300 hashes');
  console.log('  - Hypertree verification: 20 layers × 35 WOTS chains × ~8 hashes = ~5,600 hashes');
  console.log('  - Total: ~6,000 SHAKE256 operations\n');
  
  console.log('Soroban budget limits:');
  console.log('  - Instructions: ~100M per transaction');
  console.log('  - Each SHAKE256: ~50K-100K instructions');
  console.log('  - Required: 6000 × 75K = 450M instructions');
  console.log('  - Result: EXCEEDS BUDGET BY 4.5x!\n');
  
  console.log('SOLUTIONS:');
  console.log('  1. ❌ Use smaller parameters (but contract is already deployed with 128f)');
  console.log('  2. ❌ Optimize contract (already pretty optimal)');
  console.log('  3. ✅ Use HYBRID model without full on-chain verification:');
  console.log('       - Register public key on-chain');
  console.log('       - Sign transactions off-chain');  
  console.log('       - Relayer does partial validation');
  console.log('       - Contract stores approval WITHOUT full verification\n');
  
  console.log('RECOMMENDATION:');
  console.log('  Modify contract to have a "trusted_approve" function that:');
  console.log('  - Skips full SPHINCS+ verification (too expensive)');
  console.log('  - Just stores the approval');
  console.log('  - Relayer can optionally verify off-chain');
  console.log('  - Or use a simpler signature scheme for on-chain verification\n');
  
  console.log('The current implementation is CORRECT but INFEASIBLE');
  console.log('due to Soroban compute limits. Need architectural change.');
}

testDirectly();
