import { EventWatcher } from './event-watcher.js';
import { TransactionHandler } from './transaction.js';
import { CONFIG, validateConfig } from './config.js';
import { startApiServer } from './api.js';
async function main() {
    console.log('===========================================');
    console.log('  Quantum Verifier - Hybrid Relayer Service');
    console.log('===========================================');
    console.log('');
    // Validate configuration
    try {
        validateConfig();
    }
    catch (error) {
        console.error('Configuration error:', error);
        process.exit(1);
    }
    console.log('Configuration:');
    console.log(`  Contract ID: ${CONFIG.CONTRACT_ID}`);
    console.log(`  Network: ${CONFIG.NETWORK}`);
    console.log(`  Soroban RPC: ${CONFIG.SOROBAN_RPC_URL}`);
    console.log(`  Horizon: ${CONFIG.HORIZON_URL}`);
    console.log(`  Poll Interval: ${CONFIG.POLL_INTERVAL_MS}ms`);
    console.log('');
    // Start API server
    startApiServer();
    console.log('');
    const watcher = new EventWatcher();
    const handler = new TransactionHandler();
    // Handle shutdown gracefully
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        watcher.stop();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        console.log('\nShutting down...');
        watcher.stop();
        process.exit(0);
    });
    // Start watching for approval events
    await watcher.startWatching(async (event) => {
        console.log('');
        console.log('========================================');
        console.log(`New approval event detected!`);
        console.log(`  Nonce: ${event.nonce}`);
        console.log(`  TX Hash: ${event.txHash}`);
        console.log(`  Address: ${event.stellarAddress}`);
        console.log(`  Ledger: ${event.ledger}`);
        console.log('========================================');
        try {
            const resultHash = await handler.processApproval(event.txHash, event.stellarAddress);
            console.log('');
            console.log(`SUCCESS: Transaction submitted!`);
            console.log(`  Result Hash: ${resultHash}`);
            console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${resultHash}`);
            console.log('');
        }
        catch (error) {
            console.error('');
            console.error(`FAILED to process approval:`);
            console.error(`  Error: ${error instanceof Error ? error.message : error}`);
            console.error('');
        }
    });
    console.log('');
    console.log('Relayer is running. Watching for approval events...');
    console.log('Press Ctrl+C to stop.');
    console.log('');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
// Export app for Vercel serverless functions
export { app } from './api.js';
