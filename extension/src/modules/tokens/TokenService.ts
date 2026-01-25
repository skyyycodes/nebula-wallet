// Token Service
import { NetworkType } from '../network/types';

const API = { MAINNET: 'https://api.stellar.expert/explorer/public', TESTNET: 'https://api.stellar.expert/explorer/testnet' };
const HORIZON = { MAINNET: 'https://horizon.stellar.org', TESTNET: 'https://horizon-testnet.stellar.org' };

export class TokenService {
  private network: NetworkType;
  constructor(network: NetworkType = NetworkType.MAINNET) { this.network = network; }

  private getUrls() { return this.network === NetworkType.MAINNET ? { expert: API.MAINNET, horizon: HORIZON.MAINNET } : { expert: API.TESTNET, horizon: HORIZON.TESTNET }; }

  async fetchTopTokens(limit = 50) { const { expert } = this.getUrls(); const r = await fetch(expert + '/asset?order=desc&limit=' + limit); const d = await r.json(); return d._embedded?.records || []; }

  async searchTokens(query: string) { const { expert } = this.getUrls(); const r = await fetch(expert + '/asset?search=' + query); const d = await r.json(); return d._embedded?.records || []; }

  async getXlmPrice() { const { expert } = this.getUrls(); const r = await fetch(expert + '/asset/XLM'); const d = await r.json(); return d.price || 0; }

  async getAccountBalances(id: string) { const { horizon } = this.getUrls(); const r = await fetch(horizon + '/accounts/' + id); const d = await r.json(); return d.balances || []; }
}

export function getTokenService(network: NetworkType = NetworkType.MAINNET) { return new TokenService(network); }
