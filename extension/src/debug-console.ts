/**
 * Debug Console for Wallet Module Testing
 * 
 * This file exposes test functions to the browser console
 * Access via: window.walletDebug
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
  AssetId,
} from './modules/dex';

import {
  getSwapExecutor,
  getPaymentExecutor,
  ExecutionMode,
} from './modules/execution';

// Test account for testnet
const TEST_PUBLIC_KEY = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR';

/**
 * Wallet Debug Interface
 */
const walletDebug = {
  // Module getters
  getNetworkManager,
  getAccountService,
  getTransactionBuilder,
  getKeyManager,
  getDexAggregator,
  getSwapExecutor,
  getPaymentExecutor,

  // Quick actions
  async testConnection() {
    console.log('🔗 Testing network connection...');
    const nm = getNetworkManager();
    await nm.initialize();
    const connected = await nm.testConnection();
    const state = nm.getState();
    console.log('Connection result:', { connected, latency: state.latencyMs + 'ms' });
    return connected;
  },

  async getFeeStats() {
    console.log('💰 Fetching fee stats...');
    const nm = getNetworkManager();
    const stats = await nm.getFeeStats();
    console.log('Fee stats:', stats);
    return stats;
  },

  async getAccountInfo(publicKey = TEST_PUBLIC_KEY) {
    console.log(`📊 Fetching account info for ${publicKey.slice(0, 10)}...`);
    const as = getAccountService();
    const info = await as.getAccountInfo(publicKey);
    console.log('Account info:', info);
    return info;
  },

  async getBalances(publicKey = TEST_PUBLIC_KEY) {
    console.log(`💳 Fetching balances for ${publicKey.slice(0, 10)}...`);
    const as = getAccountService();
    const balances = await as.getBalances(publicKey);
    console.table(balances.map(b => ({
      asset: b.assetCode,
      balance: b.balance,
      available: b.availableBalance,
    })));
    return balances;
  },

  async getQuote(
    sourceCode = 'XLM',
    destCode = 'USDC',
    amount = '100',
    destIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  ) {
    console.log(`📈 Getting quote: ${amount} ${sourceCode} -> ${destCode}...`);
    
    const sourceAsset: AssetId = { 
      code: sourceCode, 
      issuer: sourceCode === 'XLM' ? null : destIssuer 
    };
    const destAsset: AssetId = { 
      code: destCode, 
      issuer: destCode === 'XLM' ? null : destIssuer 
    };

    const result = await getSwapQuote(sourceAsset, destAsset, amount, 'exactIn', 0.01);
    
    if (result.bestQuote) {
      console.log('Best quote:', {
        source: result.bestQuote.source,
        rate: result.bestQuote.rate,
        output: result.bestQuote.destAmount,
        priceImpact: result.bestQuote.priceImpact + '%',
        minReceived: result.bestQuote.minimumReceived,
      });
    } else {
      console.log('No quotes available');
    }
    
    return result;
  },

  async switchNetwork(network: 'testnet' | 'mainnet') {
    console.log(`🔄 Switching to ${network}...`);
    const nm = getNetworkManager();
    await nm.switchNetwork(network === 'testnet' ? NetworkType.TESTNET : NetworkType.MAINNET);
    console.log('Switched to:', nm.getConfig().name);
    return nm.getConfig();
  },

  generateKeypair() {
    console.log('🔑 Generating new keypair...');
    const km = getKeyManager();
    const result = km.generateKeypair();
    console.log('New keypair:', {
      publicKey: result.publicKey,
      secretKey: result.secretKey.slice(0, 10) + '...',
    });
    return result;
  },

  // Full test suite
  async runAllTests() {
    console.log('\n' + '🚀'.repeat(20));
    console.log('RUNNING ALL WALLET TESTS');
    console.log('🚀'.repeat(20) + '\n');

    const results: { name: string; passed: boolean; error?: string }[] = [];

    const runTest = async (name: string, fn: () => Promise<void>) => {
      console.log(`\n🧪 ${name}...`);
      try {
        await fn();
        results.push({ name, passed: true });
        console.log(`   ✅ PASSED`);
      } catch (e: any) {
        results.push({ name, passed: false, error: e.message });
        console.log(`   ❌ FAILED: ${e.message}`);
      }
    };

    // Network tests
    await runTest('Network initialization', async () => {
      const nm = getNetworkManager();
      await nm.initialize();
    });

    await runTest('Network connection', async () => {
      const nm = getNetworkManager();
      const connected = await nm.testConnection();
      if (!connected) throw new Error('Not connected');
    });

    await runTest('Fee stats', async () => {
      const nm = getNetworkManager();
      const stats = await nm.getFeeStats();
      if (!stats.recommended) throw new Error('No recommended fee');
    });

    // Wallet tests
    await runTest('Account service', async () => {
      const as = getAccountService();
      const info = await as.getAccountInfo(TEST_PUBLIC_KEY);
      if (!info.publicKey) throw new Error('No public key');
    });

    await runTest('Balance fetching', async () => {
      const as = getAccountService();
      const balances = await as.getBalances(TEST_PUBLIC_KEY);
      console.log(`   Found ${balances.length} balance(s)`);
    });

    await runTest('Key generation', async () => {
      const km = getKeyManager();
      const result = km.generateKeypair();
      if (!result.publicKey.startsWith('G')) throw new Error('Invalid public key');
    });

    // DEX tests
    await runTest('DEX aggregator', async () => {
      const agg = getDexAggregator();
      const sources = agg.getAvailableSources();
      if (sources.length === 0) throw new Error('No sources');
      console.log(`   Sources: ${sources.join(', ')}`);
    });

    await runTest('Quote fetching', async () => {
      const result = await getSwapQuote(
        { code: 'XLM', issuer: null },
        { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
        '100',
        'exactIn',
        0.01
      );
      if (result.bestQuote) {
        console.log(`   Rate: 1 XLM = ${result.bestQuote.rate.toFixed(4)} USDC`);
      }
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    results.forEach(r => {
      console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
    });
    
    console.log('='.repeat(50));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(50));

    return { passed, failed, results };
  },

  // Help
  help() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              WALLET DEBUG CONSOLE                             ║
╠═══════════════════════════════════════════════════════════════╣
║ Available commands:                                           ║
║                                                               ║
║ walletDebug.testConnection()     - Test network connection    ║
║ walletDebug.getFeeStats()        - Get current fee stats      ║
║ walletDebug.getAccountInfo(pk)   - Get account details        ║
║ walletDebug.getBalances(pk)      - Get all balances           ║
║ walletDebug.getQuote(src,dst,amt)- Get swap quote             ║
║ walletDebug.switchNetwork(net)   - Switch testnet/mainnet     ║
║ walletDebug.generateKeypair()    - Generate new keypair       ║
║ walletDebug.runAllTests()        - Run full test suite        ║
║                                                               ║
║ Module access:                                                ║
║ walletDebug.getNetworkManager()                               ║
║ walletDebug.getAccountService()                               ║
║ walletDebug.getDexAggregator()                                ║
║ walletDebug.getSwapExecutor()                                 ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }
};

// Expose to window
(window as any).walletDebug = walletDebug;
(window as any).runWalletTests = walletDebug.runAllTests;

// Auto-announce on load
console.log('🔧 Wallet Debug Console loaded. Type walletDebug.help() for commands.');
