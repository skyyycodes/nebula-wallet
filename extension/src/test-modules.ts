/**
 * Test script for Stellar Wallet + DEX Aggregator modules
 * 
 * Run this in the browser console or as a test file
 */

import { 
  getNetworkManager, 
  NetworkType,
  TESTNET_CONFIG,
  MAINNET_CONFIG 
} from './modules/network';

import {
  getAccountService,
  getTransactionBuilder,
  getKeyManager,
} from './modules/wallet';

import {
  getDexAggregator,
  getSwapQuote,
  DexSource,
} from './modules/dex';

import {
  getSwapExecutor,
  getPaymentExecutor,
  ExecutionMode,
} from './modules/execution';

// Test wallet for testnet (DO NOT USE ON MAINNET)
const TEST_PUBLIC_KEY = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3YBIFZPQJ4T7';

/**
 * Test Results Logger
 */
class TestRunner {
  private results: { name: string; passed: boolean; error?: string; duration: number }[] = [];

  async run(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    console.log(`\n🧪 Running: ${name}`);
    
    try {
      await testFn();
      this.results.push({ name, passed: true, duration: Date.now() - start });
      console.log(`   ✅ PASSED (${Date.now() - start}ms)`);
    } catch (error: any) {
      this.results.push({ name, passed: false, error: error.message, duration: Date.now() - start });
      console.log(`   ❌ FAILED: ${error.message}`);
    }
  }

  summary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    this.results.forEach(r => {
      const icon = r.passed ? '✅' : '❌';
      console.log(`${icon} ${r.name} (${r.duration}ms)`);
      if (r.error) console.log(`   Error: ${r.error}`);
    });
    
    console.log('='.repeat(50));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(50));
  }
}

/**
 * Network Module Tests
 */
async function testNetworkModule(runner: TestRunner): Promise<void> {
  await runner.run('Network: Config constants exist', async () => {
    if (!TESTNET_CONFIG.horizonUrl) throw new Error('Missing testnet horizon URL');
    if (!MAINNET_CONFIG.horizonUrl) throw new Error('Missing mainnet horizon URL');
    if (!TESTNET_CONFIG.passphrase) throw new Error('Missing testnet passphrase');
    if (!MAINNET_CONFIG.passphrase) throw new Error('Missing mainnet passphrase');
  });

  await runner.run('Network: Manager initialization', async () => {
    const nm = getNetworkManager();
    await nm.initialize();
    const config = nm.getConfig();
    if (!config) throw new Error('Failed to get config');
  });

  await runner.run('Network: Get network type', async () => {
    const nm = getNetworkManager();
    const type = nm.getNetworkType();
    if (type !== NetworkType.TESTNET && type !== NetworkType.MAINNET) {
      throw new Error(`Invalid network type: ${type}`);
    }
  });

  await runner.run('Network: Connection test', async () => {
    const nm = getNetworkManager();
    const connected = await nm.testConnection();
    if (!connected) throw new Error('Failed to connect to network');
  });

  await runner.run('Network: Fee stats fetching', async () => {
    const nm = getNetworkManager();
    const stats = await nm.getFeeStats();
    if (!stats.recommended) throw new Error('Missing recommended fee');
    if (stats.recommended < 100) throw new Error('Fee too low');
    console.log(`   Fee stats: min=${stats.min}, avg=${stats.average}, recommended=${stats.recommended}`);
  });

  await runner.run('Network: Recommended fee calculation', async () => {
    const nm = getNetworkManager();
    const fee = await nm.getRecommendedFee(2);
    if (fee < 200) throw new Error(`Fee too low for 2 ops: ${fee}`);
    console.log(`   Recommended fee for 2 ops: ${fee} stroops`);
  });
}

/**
 * Wallet Module Tests
 */
async function testWalletModule(runner: TestRunner): Promise<void> {
  await runner.run('Wallet: Account service singleton', async () => {
    const as1 = getAccountService();
    const as2 = getAccountService();
    if (as1 !== as2) throw new Error('Not a singleton');
  });

  await runner.run('Wallet: Fetch account info (testnet)', async () => {
    const accountService = getAccountService();
    const info = await accountService.getAccountInfo(TEST_PUBLIC_KEY);
    
    console.log(`   Public key: ${info.publicKey.slice(0, 10)}...`);
    console.log(`   Is active: ${info.isActive}`);
    console.log(`   Balance count: ${info.balances.length}`);
    
    if (!info.publicKey) throw new Error('Missing public key');
  });

  await runner.run('Wallet: Fetch XLM balance', async () => {
    const accountService = getAccountService();
    const xlmBalance = await accountService.getXlmBalance(TEST_PUBLIC_KEY);
    
    if (xlmBalance) {
      console.log(`   XLM Balance: ${xlmBalance.balance}`);
      console.log(`   Available: ${xlmBalance.availableBalance}`);
    } else {
      console.log('   Account not funded or does not exist');
    }
  });

  await runner.run('Wallet: Fetch all balances', async () => {
    const accountService = getAccountService();
    const balances = await accountService.getBalances(TEST_PUBLIC_KEY);
    
    console.log(`   Found ${balances.length} balance(s):`);
    balances.forEach(b => {
      console.log(`   - ${b.assetCode}: ${b.balance}`);
    });
  });

  await runner.run('Wallet: Key validation', async () => {
    const km = getKeyManager();
    
    const validPublic = km.isValidPublicKey(TEST_PUBLIC_KEY);
    if (!validPublic) throw new Error('Should validate correct public key');
    
    const invalidPublic = km.isValidPublicKey('invalid');
    if (invalidPublic) throw new Error('Should reject invalid public key');
  });

  await runner.run('Wallet: Key generation', async () => {
    const km = getKeyManager();
    const result = km.generateKeypair();
    
    if (!result.publicKey) throw new Error('Missing public key');
    if (!result.secretKey) throw new Error('Missing secret key');
    if (!result.publicKey.startsWith('G')) throw new Error('Invalid public key format');
    if (!result.secretKey.startsWith('S')) throw new Error('Invalid secret key format');
    
    console.log(`   Generated: ${result.publicKey.slice(0, 10)}...`);
  });
}

/**
 * DEX Aggregator Tests
 */
async function testDexModule(runner: TestRunner): Promise<void> {
  await runner.run('DEX: Aggregator singleton', async () => {
    const agg1 = getDexAggregator();
    const agg2 = getDexAggregator();
    if (agg1 !== agg2) throw new Error('Not a singleton');
  });

  await runner.run('DEX: Available sources', async () => {
    const aggregator = getDexAggregator();
    const sources = aggregator.getAvailableSources();
    
    console.log(`   Available sources: ${sources.join(', ')}`);
    
    if (!sources.includes(DexSource.STELLAR_SDEX)) {
      throw new Error('STELLAR_SDEX should be available');
    }
  });

  await runner.run('DEX: Quote XLM -> USDC (testnet)', async () => {
    const result = await getSwapQuote(
      { code: 'XLM', issuer: null },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      '100', // 100 XLM
      'exactIn',
      0.01 // 1% slippage
    );

    console.log(`   Aggregation time: ${result.aggregationTimeMs}ms`);
    console.log(`   Quotes received: ${result.allQuotes.length}`);
    console.log(`   Failures: ${result.failures.length}`);
    
    if (result.bestQuote) {
      console.log(`   Best quote:`);
      console.log(`     Source: ${result.bestQuote.source}`);
      console.log(`     Rate: 1 XLM = ${result.bestQuote.rate.toFixed(6)} USDC`);
      console.log(`     Output: ${result.bestQuote.destAmount} USDC`);
      console.log(`     Price impact: ${result.bestQuote.priceImpact.toFixed(2)}%`);
      console.log(`     Route hops: ${result.bestQuote.route.hopCount}`);
    } else {
      console.log('   No quote available (may be no liquidity on testnet)');
    }
  });

  await runner.run('DEX: Quote USDC -> XLM (reverse)', async () => {
    const result = await getSwapQuote(
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      { code: 'XLM', issuer: null },
      '10', // 10 USDC
      'exactIn',
      0.01
    );

    if (result.bestQuote) {
      console.log(`   10 USDC -> ${result.bestQuote.destAmount} XLM`);
    } else {
      console.log('   No quote available');
    }
  });

  await runner.run('DEX: Check pair tradeability', async () => {
    const aggregator = getDexAggregator();
    
    // XLM/USDC should be tradeable
    const tradeable = await aggregator.isPairTradeable(
      { code: 'XLM', issuer: null },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' }
    );
    
    console.log(`   XLM/USDC tradeable: ${tradeable}`);
  });
}

/**
 * Execution Module Tests
 */
async function testExecutionModule(runner: TestRunner): Promise<void> {
  await runner.run('Execution: Swap executor singleton', async () => {
    const ex1 = getSwapExecutor();
    const ex2 = getSwapExecutor();
    if (ex1 !== ex2) throw new Error('Not a singleton');
  });

  await runner.run('Execution: Payment executor singleton', async () => {
    const ex1 = getPaymentExecutor();
    const ex2 = getPaymentExecutor();
    if (ex1 !== ex2) throw new Error('Not a singleton');
  });

  await runner.run('Execution: Fee estimation for swap', async () => {
    const result = await getSwapQuote(
      { code: 'XLM', issuer: null },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      '100',
      'exactIn',
      0.01
    );

    if (result.bestQuote) {
      const executor = getSwapExecutor();
      const fee = await executor.estimateSwapFee(result.bestQuote);
      console.log(`   Estimated swap fee: ${fee} XLM`);
    } else {
      console.log('   Skipped - no quote available');
    }
  });

  await runner.run('Execution: Build-only mode (no submit)', async () => {
    // This test would require a funded account with a secret key
    // For safety, we just verify the executor exists and methods are callable
    const executor = getSwapExecutor();
    
    if (typeof executor.executeSwap !== 'function') {
      throw new Error('executeSwap method missing');
    }
    if (typeof executor.buildSwapTransaction !== 'function') {
      throw new Error('buildSwapTransaction method missing');
    }
    if (typeof executor.checkTrustlines !== 'function') {
      throw new Error('checkTrustlines method missing');
    }
    
    console.log('   All executor methods available');
  });
}

/**
 * Integration Tests
 */
async function testIntegration(runner: TestRunner): Promise<void> {
  await runner.run('Integration: Full quote flow', async () => {
    // 1. Initialize network
    const nm = getNetworkManager();
    await nm.initialize();
    
    // 2. Verify connection
    const connected = await nm.testConnection();
    if (!connected) throw new Error('Network not connected');
    
    // 3. Get account info
    const accountService = getAccountService();
    const info = await accountService.getAccountInfo(TEST_PUBLIC_KEY);
    
    // 4. Get swap quote
    const quote = await getSwapQuote(
      { code: 'XLM', issuer: null },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      '10',
      'exactIn',
      0.005
    );
    
    console.log('   ✓ Network initialized');
    console.log('   ✓ Connection verified');
    console.log(`   ✓ Account loaded (${info.balances.length} balances)`);
    console.log(`   ✓ Quote received (${quote.allQuotes.length} sources)`);
  });
}

/**
 * Main Test Runner
 */
export async function runAllTests(): Promise<void> {
  console.log('\n' + '🚀'.repeat(25));
  console.log('STELLAR WALLET + DEX AGGREGATOR TESTS');
  console.log('🚀'.repeat(25));
  
  const runner = new TestRunner();
  
  console.log('\n📦 NETWORK MODULE');
  await testNetworkModule(runner);
  
  console.log('\n📦 WALLET MODULE');
  await testWalletModule(runner);
  
  console.log('\n📦 DEX MODULE');
  await testDexModule(runner);
  
  console.log('\n📦 EXECUTION MODULE');
  await testExecutionModule(runner);
  
  console.log('\n📦 INTEGRATION TESTS');
  await testIntegration(runner);
  
  runner.summary();
}

// Auto-run if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  (window as any).runWalletTests = runAllTests;
  console.log('💡 Run tests with: runWalletTests()');
} else {
  // Node environment
  runAllTests().catch(console.error);
}
