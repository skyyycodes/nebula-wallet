import * as StellarSdk from '@stellar/stellar-sdk';
import { CONFIG } from './config.js';

export interface ApprovalEvent {
  txHash: string;
  stellarAddress: string;
  timestamp: number;
  nonce: number;
  ledger: number;
}

export class EventWatcher {
  private server: StellarSdk.SorobanRpc.Server;
  private lastLedger: number = 0;
  private processedNonces: Set<number> = new Set();
  private isRunning: boolean = false;

  constructor() {
    this.server = new StellarSdk.SorobanRpc.Server(CONFIG.SOROBAN_RPC_URL);
  }

  async startWatching(onApproval: (event: ApprovalEvent) => Promise<void>) {
    console.log('Starting event watcher...');
    console.log(`Contract ID: ${CONFIG.CONTRACT_ID}`);
    console.log(`RPC URL: ${CONFIG.SOROBAN_RPC_URL}`);

    // Get current ledger
    try {
      const latestLedger = await this.server.getLatestLedger();
      this.lastLedger = latestLedger.sequence - 10; // Start from recent history
      console.log(`Starting from ledger: ${this.lastLedger}`);
    } catch (error) {
      console.error('Failed to get latest ledger:', error);
      this.lastLedger = 0;
    }

    this.isRunning = true;

    // Poll for events
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.pollEvents(onApproval);
      } catch (error) {
        console.error('Error polling events:', error);
      }

      // Schedule next poll
      setTimeout(poll, CONFIG.POLL_INTERVAL_MS);
    };

    poll();
  }

  stop() {
    this.isRunning = false;
    console.log('Event watcher stopped');
  }

  private async pollEvents(onApproval: (event: ApprovalEvent) => Promise<void>) {
    try {
      // Query for events from our contract
      const response = await this.server.getEvents({
        startLedger: this.lastLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [CONFIG.CONTRACT_ID],
          }
        ],
        limit: 100
      });

      if (!response.events || response.events.length === 0) {
        return;
      }

      for (const event of response.events) {
        // Update last ledger
        this.lastLedger = Math.max(this.lastLedger, event.ledger + 1);

        // Check if this is an "approved" event
        if (!this.isApprovalEvent(event)) {
          continue;
        }

        // Parse the event
        const approval = this.parseApprovalEvent(event);
        if (!approval) {
          continue;
        }

        // Skip if already processed
        if (this.processedNonces.has(approval.nonce)) {
          continue;
        }

        console.log(`Found approval event: nonce=${approval.nonce}, txHash=${approval.txHash}`);
        this.processedNonces.add(approval.nonce);

        // Process the approval
        try {
          await onApproval(approval);
        } catch (error) {
          console.error(`Failed to process approval ${approval.nonce}:`, error);
          // Remove from processed so we can retry
          this.processedNonces.delete(approval.nonce);
        }
      }
    } catch (error) {
      // Ignore "start is before oldest ledger" errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('start is before oldest ledger')) {
        // Reset to a more recent ledger
        try {
          const latestLedger = await this.server.getLatestLedger();
          this.lastLedger = latestLedger.sequence - 10;
        } catch {
          // Ignore
        }
      } else {
        throw error;
      }
    }
  }

  private isApprovalEvent(event: StellarSdk.SorobanRpc.Api.EventResponse): boolean {
    // Check if the event topic contains "approved"
    try {
      if (!event.topic || event.topic.length < 1) {
        return false;
      }

      // Use any to bypass SDK type issues
      const topic0 = StellarSdk.xdr.ScVal.fromXDR(event.topic[0] as any, 'base64');

      if (topic0.switch().name === 'scvSymbol') {
        const symbol = topic0.sym().toString();
        return symbol === 'approved';
      }
      return false;
    } catch {
      return false;
    }
  }

  private parseApprovalEvent(event: StellarSdk.SorobanRpc.Api.EventResponse): ApprovalEvent | null {
    try {
      // Parse the event value (ApprovalEvent struct)
      const value = StellarSdk.xdr.ScVal.fromXDR(event.value as any, 'base64');

      // ApprovalEvent is a map/struct with tx_hash, timestamp, nonce
      let txHash = '';
      let timestamp = 0;
      let nonce = 0;

      if (value.switch().name === 'scvMap') {
        const map = value.map();
        if (map) {
          for (const entry of map) {
            const key = entry.key();
            const val = entry.val();

            if (key.switch().name === 'scvSymbol') {
              const keyName = key.sym().toString();

              if (keyName === 'tx_hash' && val.switch().name === 'scvBytes') {
                txHash = Buffer.from(val.bytes()).toString('hex');
              } else if (keyName === 'timestamp' && val.switch().name === 'scvU64') {
                timestamp = Number(val.u64());
              } else if (keyName === 'nonce' && val.switch().name === 'scvU64') {
                nonce = Number(val.u64());
              }
            }
          }
        }
      }

      // Parse stellar address from topic[1]
      let stellarAddress = '';
      if (event.topic && event.topic.length > 1) {
        const topic1 = StellarSdk.xdr.ScVal.fromXDR(event.topic[1] as any, 'base64');

        if (topic1.switch().name === 'scvAddress') {
          const addr = topic1.address();
          if (addr.switch().name === 'scAddressTypeAccount') {
            const pubKey = addr.accountId().ed25519();
            stellarAddress = StellarSdk.StrKey.encodeEd25519PublicKey(pubKey);
          }
        }
      }

      if (!txHash || !nonce) {
        console.warn('Failed to parse approval event: missing required fields');
        return null;
      }

      return {
        txHash,
        stellarAddress,
        timestamp,
        nonce,
        ledger: event.ledger,
      };
    } catch (error) {
      console.error('Failed to parse approval event:', error);
      return null;
    }
  }
}
