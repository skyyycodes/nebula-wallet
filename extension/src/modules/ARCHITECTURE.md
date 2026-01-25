# Stellar Wallet + DEX Aggregator Architecture

## Overview

This document describes the modular architecture for the Stellar wallet with DeFi aggregation capabilities. The system is designed with clean separation of concerns, network-agnostic wallet logic, and extensible DEX integration.

## Directory Structure

```
extension/src/modules/
├── index.ts                    # Central exports
├── network/                    # Network Layer
│   ├── index.ts
│   ├── types.ts               # NetworkConfig, NetworkState, FeeStats
│   ├── config.ts              # Testnet/Mainnet configurations
│   └── NetworkManager.ts      # Network switching, fee estimation
├── wallet/                     # Wallet Core
│   ├── index.ts
│   ├── types.ts               # AccountInfo, TransactionResult, etc.
│   ├── AccountService.ts      # Balance fetching, account info
│   ├── TransactionBuilder.ts  # Transaction construction & submission
│   └── KeyManager.ts          # Key generation, encryption, storage
├── dex/                        # DEX Aggregation Layer
│   ├── index.ts
│   ├── types.ts               # Quote, SwapRoute, LiquiditySource, etc.
│   ├── BaseLiquiditySource.ts # Abstract base for DEX integrations
│   ├── DexAggregator.ts       # Multi-source aggregation
│   └── sources/               # DEX implementations
│       ├── index.ts
│       └── StellarDexSource.ts # Native SDEX orderbook
└── execution/                  # Execution Engine
    ├── index.ts
    ├── types.ts               # ExecutionRequest, ExecutionResult
    ├── SwapExecutor.ts        # Swap transaction execution
    └── PaymentExecutor.ts     # Payment & X402 execution
```

## Module Details

### 1. Network Layer (`/modules/network`)

**Purpose**: Manage Stellar network connections, configuration, and switching.

**Key Components**:

- **NetworkConfig**: Defines Horizon URL, passphrase, fee defaults, explorer URL
- **NetworkManager**: Singleton handling network state and switching

**Features**:
- ✅ Testnet & Mainnet configurations
- ✅ Safe network switching with state persistence
- ✅ Dynamic fee estimation from network
- ✅ Connection health monitoring
- ✅ Friendbot integration for testnet funding

**Usage**:
```typescript
import { getNetworkManager, NetworkType } from './modules/network';

const nm = getNetworkManager();
await nm.initialize();

// Switch networks
await nm.switchNetwork(NetworkType.MAINNET);

// Get current config
const config = nm.getConfig();
console.log(config.horizonUrl); // https://horizon.stellar.org

// Estimate fees
const fee = await nm.getRecommendedFee(2); // for 2 operations
```

---

### 2. Wallet Core (`/modules/wallet`)

**Purpose**: Account management, balance fetching, transaction building.

**Key Components**:

- **AccountService**: Fetches account info and balances
- **TransactionBuilder**: Constructs and submits transactions
- **KeyManager**: Key generation, import, and secure storage

**Features**:
- ✅ Full balance fetching (XLM + all issued assets)
- ✅ Minimum balance calculation
- ✅ Available balance calculation (respects liabilities)
- ✅ Transaction building with memo support
- ✅ Dynamic fee estimation integration
- ✅ Comprehensive error handling with human-readable messages

**Usage**:
```typescript
import { getAccountService, getTransactionBuilder } from './modules/wallet';

// Fetch balances
const accountService = getAccountService();
const info = await accountService.getAccountInfo(publicKey);

console.log(info.availableXlm);      // "99.5000000"
console.log(info.balances);          // Array of all asset balances

// Build a payment
const txBuilder = getTransactionBuilder();
const tx = await txBuilder.buildPayment(
  { destination, asset: Asset.native(), amount: "10" },
  { sourceAccount: publicKey, useDynamicFee: true }
);
const result = await txBuilder.signAndSubmit(tx, secretKey);
```

---

### 3. DEX Aggregator (`/modules/dex`)

**Purpose**: Query multiple liquidity sources and find best swap routes.

**Key Components**:

- **ILiquiditySource**: Interface all DEX integrations implement
- **BaseLiquiditySource**: Abstract base with helper methods
- **StellarDexSource**: Native SDEX orderbook integration
- **DexAggregator**: Queries all sources and selects best route

**Features**:
- ✅ Pluggable architecture for new DEX sources
- ✅ Parallel quote fetching with timeout handling
- ✅ Best route selection (max output for exactIn, min input for exactOut)
- ✅ Price impact calculation
- ✅ Slippage tolerance configuration
- ✅ Quote expiration tracking
- ✅ Warning generation for high price impact

**Supported Sources**:
- ✅ Stellar SDEX (Native Orderbook)
- 🔜 Soroswap (Soroban AMM)
- 🔜 Phoenix DEX
- 🔜 Aquarius Liquidity Pools

**Adding a New DEX Source**:
```typescript
import { BaseLiquiditySource, DexSource, Quote, QuoteRequest } from '../types';

export class NewDexSource extends BaseLiquiditySource {
  readonly source = DexSource.NEW_DEX; // Add to enum
  readonly name = 'New DEX';

  async supportsPair(sourceAsset, destAsset): Promise<boolean> {
    // Check if pair is tradeable
  }

  async getQuote(request: QuoteRequest): Promise<Quote> {
    // Fetch and return quote
  }
}

// Register with aggregator
const aggregator = getDexAggregator();
aggregator.registerSource(new NewDexSource());
```

**Usage**:
```typescript
import { getDexAggregator, getSwapQuote } from './modules/dex';

// Quick quote
const result = await getSwapQuote(
  { code: 'XLM', issuer: null },
  { code: 'USDC', issuer: 'GBBD47...' },
  '100',
  'exactIn',
  0.005, // 0.5% slippage
  userPublicKey
);

console.log(result.bestQuote?.destAmount);   // "12.345678"
console.log(result.bestQuote?.priceImpact);  // -0.5 (%)
console.log(result.bestQuote?.route);        // Swap route details
```

---

### 4. Execution Engine (`/modules/execution`)

**Purpose**: Execute swaps and payments with progress tracking.

**Key Components**:

- **SwapExecutor**: Builds and submits swap transactions
- **PaymentExecutor**: Handles simple payments and X402 micropayments

**Features**:
- ✅ Multiple execution modes (IMMEDIATE, BUILD_ONLY, SIMULATE)
- ✅ Progress callbacks for UI updates
- ✅ Trustline validation before swap
- ✅ Automatic trustline creation
- ✅ Comprehensive error parsing
- ✅ X402 protocol compatible payment execution
- ✅ Batch payment support

**Usage**:
```typescript
import { getSwapExecutor, ExecutionMode } from './modules/execution';

const executor = getSwapExecutor();
const result = await executor.executeSwap(
  {
    quote: bestQuote,
    userPublicKey,
    secretKey,
    mode: ExecutionMode.IMMEDIATE,
    slippageTolerance: 0.01,
  },
  {
    onProgress: (status, details) => {
      console.log(`Status: ${status} - ${details}`);
    },
    useDynamicFee: true,
  }
);

if (result.success) {
  console.log(`Swap completed: ${result.transactionHash}`);
}
```

---

## Data Flow

```
┌─────────────────┐
│   User Input    │
│  (Swap Request) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  DEX Aggregator │ ──► Queries multiple sources in parallel
│                 │
│  ┌───────────┐  │
│  │ SDEX      │  │
│  │ Soroswap  │  │
│  │ Phoenix   │  │
│  └───────────┘  │
└────────┬────────┘
         │ Best Quote
         ▼
┌─────────────────┐
│  Swap Executor  │ ──► Uses NetworkManager for config
│                 │ ──► Uses TransactionBuilder for tx
└────────┬────────┘
         │ Signed Transaction
         ▼
┌─────────────────┐
│ NetworkManager  │ ──► Submits to Horizon
│  (Horizon API)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Transaction     │
│ Result          │
└─────────────────┘
```

---

## Network Configuration

| Setting          | Testnet                               | Mainnet                              |
|------------------|---------------------------------------|--------------------------------------|
| Horizon URL      | horizon-testnet.stellar.org           | horizon.stellar.org                  |
| Soroban RPC      | soroban-testnet.stellar.org           | soroban.stellar.org                  |
| Passphrase       | Test SDF Network ; September 2015     | Public Global Stellar Network...     |
| Default Fee      | 100 stroops                           | 100 stroops                          |
| Max Fee          | 100,000 stroops (0.01 XLM)            | 500,000 stroops (0.05 XLM)           |
| Friendbot        | ✅ Available                           | ❌ Not available                      |

---

## X402 Compatibility

The execution module includes X402-compatible payment execution:

```typescript
import { getPaymentExecutor } from './modules/execution';

const executor = getPaymentExecutor();
const result = await executor.executeX402Payment(
  sourcePublicKey,
  secretKey,
  {
    destination: merchantPublicKey,
    amount: '0.001',
    reference: 'content-access-token',
    resource: 'https://example.com/premium-content',
    requestId: 'x402-req-123',
  }
);

// Result includes X402 receipt for verification
console.log(result.receipt);
```

---

## Agent Integration

The architecture is designed for agent-based automation:

```typescript
// Quote-only mode (read-only, no wallet needed)
const quote = await getSwapQuote(source, dest, amount, 'exactIn', 0.01);

// Execution (requires wallet)
const result = await getSwapExecutor().executeSwap({
  quote: quote.bestQuote!,
  userPublicKey,
  secretKey,
  mode: ExecutionMode.IMMEDIATE,
});

// All modules are singleton-based and can be called programmatically
```

---

## Error Handling

The system provides comprehensive error handling:

| Error Code           | Description                          | User Message                         |
|----------------------|--------------------------------------|--------------------------------------|
| op_underfunded       | Insufficient balance                 | "Insufficient balance for swap"      |
| op_no_trust          | Missing trustline                    | "Missing trustline for asset"        |
| op_too_few_offers    | Low liquidity                        | "Not enough liquidity for swap"      |
| tx_bad_seq           | Sequence mismatch                    | "Sequence number mismatch"           |
| tx_insufficient_balance | Can't pay fee                     | "Insufficient XLM balance for fee"   |

---

## Future Enhancements

1. **Additional DEX Sources**:
   - Soroswap AMM integration
   - Phoenix DEX integration
   - Aquarius pools

2. **Advanced Features**:
   - Split routes across multiple DEXs
   - Limit orders
   - DCA (Dollar Cost Averaging)
   - Price alerts

3. **Analytics**:
   - Trade history tracking
   - P&L calculation
   - Portfolio analytics

---

## Testing

```bash
# Run module tests
cd extension
npm test

# Test specific module
npm test -- --grep "NetworkManager"
npm test -- --grep "DexAggregator"
```
