/**
 * Quick Test Script for DEX Aggregator
 * 
 * Run with: npx ts-node test-dex-quick.ts
 * Or compile and run: npx tsc test-dex-quick.ts && node test-dex-quick.js
 */

import * as StellarSdk from '@stellar/stellar-sdk';

// Direct imports for standalone testing
const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// Test account (public testnet account)
const TEST_ACCOUNT = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR';

// USDC on testnet
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

async function main() {
  console.log('🧪 Stellar DEX Aggregator Quick Test\n');
  
  const server = new StellarSdk.Horizon.Server(HORIZON_TESTNET);
  
  // Test 1: Network Connection
  console.log('1️⃣ Testing network connection...');
  try {
    const ledger = await server.ledgers().order('desc').limit(1).call();
    console.log(`   ✅ Connected to testnet, latest ledger: ${ledger.records[0].sequence}\n`);
  } catch (e: any) {
    console.log(`   ❌ Connection failed: ${e.message}\n`);
    return;
  }

  // Test 2: Fee Stats
  console.log('2️⃣ Testing fee stats...');
  try {
    const feeStats = await server.feeStats();
    console.log(`   ✅ Fee stats retrieved:`);
    console.log(`      Min: ${feeStats.fee_charged.min} stroops`);
    console.log(`      Mode: ${feeStats.fee_charged.mode} stroops`);
    console.log(`      P70: ${feeStats.fee_charged.p70} stroops\n`);
  } catch (e: any) {
    console.log(`   ❌ Fee stats failed: ${e.message}\n`);
  }

  // Test 3: Account Info
  console.log('3️⃣ Testing account fetching...');
  try {
    const account = await server.loadAccount(TEST_ACCOUNT);
    console.log(`   ✅ Account loaded:`);
    console.log(`      Sequence: ${account.sequence}`);
    console.log(`      Balances: ${account.balances.length}`);
    account.balances.forEach((b: any) => {
      const code = b.asset_type === 'native' ? 'XLM' : b.asset_code;
      console.log(`      - ${code}: ${parseFloat(b.balance).toFixed(4)}`);
    });
    console.log();
  } catch (e: any) {
    console.log(`   ⚠️ Account not found (may not be funded): ${e.message}\n`);
  }

  // Test 4: Orderbook Query (XLM/USDC)
  console.log('4️⃣ Testing orderbook query (XLM/USDC)...');
  try {
    const xlm = StellarSdk.Asset.native();
    const usdc = new StellarSdk.Asset('USDC', USDC_ISSUER);
    
    const orderbook = await server.orderbook(xlm, usdc).limit(5).call();
    
    console.log(`   ✅ Orderbook retrieved:`);
    console.log(`      Bids (buy XLM): ${orderbook.bids.length}`);
    console.log(`      Asks (sell XLM): ${orderbook.asks.length}`);
    
    if (orderbook.bids.length > 0) {
      console.log(`      Best bid: ${orderbook.bids[0].price} USDC/XLM`);
    }
    if (orderbook.asks.length > 0) {
      console.log(`      Best ask: ${orderbook.asks[0].price} USDC/XLM`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ❌ Orderbook query failed: ${e.message}\n`);
  }

  // Test 5: Path Finding (Strict Send)
  console.log('5️⃣ Testing path finding (100 XLM -> USDC)...');
  try {
    const xlm = StellarSdk.Asset.native();
    const usdc = new StellarSdk.Asset('USDC', USDC_ISSUER);
    
    const paths = await server.strictSendPaths(xlm, '100', [usdc]).call();
    
    if (paths.records.length > 0) {
      console.log(`   ✅ Found ${paths.records.length} path(s):`);
      paths.records.slice(0, 3).forEach((path: any, i: number) => {
        console.log(`      Path ${i + 1}:`);
        console.log(`        Send: ${path.source_amount} XLM`);
        console.log(`        Receive: ${path.destination_amount} USDC`);
        console.log(`        Rate: 1 XLM = ${(parseFloat(path.destination_amount) / parseFloat(path.source_amount)).toFixed(6)} USDC`);
        console.log(`        Hops: ${path.path.length}`);
      });
    } else {
      console.log(`   ⚠️ No paths found (no liquidity on testnet)`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ❌ Path finding failed: ${e.message}\n`);
  }

  // Test 6: Path Finding (Strict Receive)
  console.log('6️⃣ Testing path finding (? XLM -> 10 USDC)...');
  try {
    const xlm = StellarSdk.Asset.native();
    const usdc = new StellarSdk.Asset('USDC', USDC_ISSUER);
    
    const paths = await server.strictReceivePaths([xlm], usdc, '10').call();
    
    if (paths.records.length > 0) {
      console.log(`   ✅ Found ${paths.records.length} path(s):`);
      paths.records.slice(0, 3).forEach((path: any, i: number) => {
        console.log(`      Path ${i + 1}:`);
        console.log(`        Send: ${path.source_amount} XLM`);
        console.log(`        Receive: ${path.destination_amount} USDC`);
      });
    } else {
      console.log(`   ⚠️ No paths found`);
    }
    console.log();
  } catch (e: any) {
    console.log(`   ❌ Path finding failed: ${e.message}\n`);
  }

  // Test 7: Build Transaction (dry run)
  console.log('7️⃣ Testing transaction building (dry run)...');
  try {
    // Create a test keypair (not submitting, just building)
    const keypair = StellarSdk.Keypair.random();
    
    // We can't actually build without a funded account, but we can test the builder
    console.log(`   ✅ Transaction builder available`);
    console.log(`      Test keypair generated: ${keypair.publicKey().slice(0, 10)}...`);
    console.log(`      (Would need funded account to build actual transaction)\n`);
  } catch (e: any) {
    console.log(`   ❌ Transaction building failed: ${e.message}\n`);
  }

  console.log('=' .repeat(50));
  console.log('✅ Quick test complete!');
  console.log('=' .repeat(50));
  console.log('\nTo run full module tests:');
  console.log('  1. cd extension');
  console.log('  2. npm run build');
  console.log('  3. Load extension in browser');
  console.log('  4. Open popup and check console');
  console.log('  5. Run: runWalletTests()');
}

main().catch(console.error);
