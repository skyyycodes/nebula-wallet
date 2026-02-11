
<p align="center">
  <img width="1076" height="501" alt="Nebula Wallet Architecture" src="https://github.com/user-attachments/assets/7cabdb81-160e-4482-95ea-6b8275e9cfcc" />
</p>

<h1 align="center">Nebula Wallet</h1>

<p align="center">
  A quantum-resistant Stellar wallet using SPHINCS+ post-quantum signatures, ZK-SNARKs, and Soroban smart contract authorization.
</p>

<p align="center">
  <a href="https://stellar.expert/explorer/testnet/contract/CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW">View Contract on Stellar.expert</a> &middot;
  <a href="https://youtu.be/ocsZVjusF24">Demo Video</a> &middot;
  <a href="https://drive.google.com/file/d/1dlyoI6VWXutEAfDx8c70KoapQMH2m3lR/view?usp=drive_link">Architecture Video</a> &middot;
  <a href="./ARCHITECTURE.md">Detailed Architecture</a>
</p>

---

## Table of Contents

- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Chrome Extension](#1-chrome-extension-wallet-ui)
  - [2. Relayer Backend](#2-relayer-backend)
  - [3. Demo Site](#3-demo-site)
  - [4. Landing Page](#4-landing-page)
  - [5. Soroban Smart Contract](#5-soroban-smart-contract)
  - [6. ZK Circuits](#6-zk-circuits)
- [API Reference](#api-reference)
- [Smart Contract Interface](#smart-contract-interface)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Performance Metrics](#performance-metrics)
- [Security Model](#security-model)
- [Deployment](#deployment)
- [Future Roadmap](#future-roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

Stellar wallets today rely on **Ed25519** digital signatures. While secure against classical computers, Ed25519 is vulnerable to quantum computers running **Shor's algorithm**. Once large-scale quantum computers become practical (estimated within 3-4 years), an attacker could:

1. Derive private keys from public keys exposed on-chain
2. Drain any wallet whose public key has been revealed through past transactions
3. Retroactively exploit historical transaction records

Every transaction you make today reveals your public key, creating a permanent vulnerability window.

## Our Solution

Nebula Wallet **completely replaces** the vulnerable Ed25519 signing mechanism:

<p align="center">
  <img width="553" height="507" alt="Solution Overview" src="https://github.com/user-attachments/assets/b471de82-789c-48f0-b9fe-7b656665c3e0" />
</p>

| Step | Action | Result |
|------|--------|--------|
| 1 | **Disable Ed25519** | Set account `masterWeight=0`, eliminating the quantum-vulnerable key |
| 2 | **Sign with SPHINCS+** | NIST-approved post-quantum signature scheme (~17KB signatures) |
| 3 | **Generate ZK Proof** | Compress signature verification into a 192-byte Groth16 proof |
| 4 | **Verify On-Chain** | Soroban smart contract verifies the proof and authorizes the transaction |

The result: a wallet where **no part of the authorization path is quantum-vulnerable**. Even with a quantum computer, an attacker cannot forge the SPHINCS+ signatures required to move funds.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User (Browser Extension)                  │
│                                                              │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────────┐ │
│  │ Wallet   │  │ SPHINCS+      │  │ Trading Agent Builder │ │
│  │ Manager  │  │ Key Manager   │  │ (Visual Programming)  │ │
│  └────┬─────┘  └──────┬────────┘  └───────────────────────┘ │
│       │               │                                      │
│       │    ┌──────────▼──────────┐                           │
│       │    │ Sign Message with   │                           │
│       │    │ SPHINCS+ (~17KB)    │                           │
│       │    └──────────┬──────────┘                           │
└───────┼───────────────┼──────────────────────────────────────┘
        │               │
        │    ┌──────────▼──────────┐
        │    │  Relayer Service     │
        │    │                      │
        │    │  1. Verify SPHINCS+  │
        │    │  2. Generate ZK Proof│
        │    │     (Groth16, 192B)  │
        │    │  3. Submit to Chain  │
        │    └──────────┬──────────┘
        │               │
        │    ┌──────────▼──────────┐
        │    │  Soroban Contract    │
        │    │  (Stellar Testnet)   │
        │    │                      │
        │    │  • Verify ZK Proof   │
        │    │  • Authorize TX      │
        │    │  • No private key    │
        │    └──────────┬──────────┘
        │               │
        └───────────────▼
              Stellar Network
```

### Component Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Extension** | TypeScript, React, Manifest V3, Webpack | Chrome wallet UI and key management |
| **Crypto** | SPHINCS+-SHAKE-256f-simple | Post-quantum digital signatures (~17KB) |
| **ZK Proofs** | Groth16 ZK-SNARKs (BLS12-381) | Compress signature verification to 192 bytes |
| **Relayer** | Node.js, Express, snarkjs | Verify signatures, generate proofs, relay transactions |
| **Smart Contract** | Rust, Soroban SDK | On-chain proof verification and transaction authorization |
| **Demo Site** | Next.js 14, React, Tailwind CSS | Interactive demo application |
| **Landing Page** | Next.js 15, Three.js, Framer Motion | Marketing and product showcase |

---

## Tech Stack

### Chrome Extension (Wallet)
- **TypeScript** with **React 18** for the popup UI
- **Manifest V3** Chrome Extension architecture
- **Webpack 5** for bundling with Node.js polyfills
- **ReactFlow** for visual agent builder
- **Lightweight Charts** for real-time price charts
- **Stellar SDK 12** for blockchain interactions
- **@noble/hashes** for cryptographic operations

### Relayer Service (Backend)
- **Node.js** with **Express 5**
- **snarkjs 0.7** for ZK proof generation
- **Stellar SDK 12** for transaction building and submission
- **TypeScript** (ES Modules)
- **Vercel**-ready serverless deployment

### Smart Contract (On-Chain)
- **Rust** with **Soroban SDK 21**
- Custom **Groth16 verifier** (BLS12-381)
- Custom **SPHINCS+ verifier** (SHAKE256)
- Compiled to **WASM32** with aggressive optimization (`opt-level=z`, LTO)

### ZK Circuits
- **Circom** circuit language with **circomlib**
- **Groth16** proof system over **BLS12-381** curve
- **snarkjs** for trusted setup and proof generation

### Demo Site
- **Next.js 14** (App Router)
- **React 18**, **Tailwind CSS 3**
- **Radix UI** component primitives
- **OpenAI** integration for AI-powered features

### Landing Page
- **Next.js 15** with **Turbopack**
- **React 19**, **Tailwind CSS 4**
- **Three.js** + **React Three Fiber** for 3D graphics
- **Framer Motion** + **GSAP** for animations
- **Monaco Editor** for interactive code demos
- **Lenis** for smooth scrolling

---

## Project Structure

```
nebula-wallet/
│
├── extension/                    # Chrome Extension (main wallet)
│   ├── src/
│   │   ├── background.ts        # Service worker (message routing)
│   │   ├── content.ts           # Content script (bridge to websites)
│   │   ├── injected.ts          # Injected provider (window.quantumStellar)
│   │   ├── sphincs.ts           # SPHINCS+ implementation
│   │   ├── stellar.ts           # Stellar SDK integration
│   │   ├── soroban.ts           # Soroban contract calls
│   │   ├── storage.ts           # Chrome storage wrapper
│   │   ├── x402.ts              # X402 micropayment protocol
│   │   ├── agent.ts             # Trading agent logic
│   │   ├── agent-runner.ts      # Agent execution engine
│   │   ├── spending.ts          # Spending account management
│   │   ├── types.ts             # Type definitions
│   │   ├── popup/               # React popup UI
│   │   │   ├── App.tsx
│   │   │   ├── components/      # UI components
│   │   │   ├── hooks/           # React hooks
│   │   │   └── views/           # Screen views
│   │   ├── approval/            # Transaction approval UI
│   │   └── modules/             # Modular architecture
│   │       ├── wallet/          # Account & transaction services
│   │       ├── dex/             # DEX aggregation
│   │       ├── execution/       # Swap/payment execution
│   │       ├── network/         # Network management
│   │       ├── tokens/          # Token management
│   │       └── charts/          # Price chart integration
│   ├── public/
│   │   ├── manifest.json        # Manifest V3 config
│   │   └── icons/               # Extension icons
│   └── webpack.config.js
│
├── relayer/                      # Backend verifier service
│   ├── src/
│   │   ├── api.ts               # Express API endpoints
│   │   ├── zk-prover.ts         # ZK proof generation
│   │   ├── sphincs-verifier.ts  # Full SPHINCS+ verification
│   │   ├── sphincs-simplified-verifier.ts  # FORS-only fast verification
│   │   ├── transaction.ts       # Transaction building
│   │   ├── event-watcher.ts     # Contract event monitoring
│   │   ├── config.ts            # Environment configuration
│   │   └── index.ts             # Server entry point
│   ├── zk-assets/               # ZK proving artifacts
│   │   ├── sphincs_main.wasm
│   │   ├── sphincs_main_final.zkey
│   │   └── verification_key.json
│   └── vercel.json              # Vercel deployment config
│
├── soroban-verifier/             # Soroban Smart Contract (Rust)
│   ├── src/
│   │   ├── lib.rs               # Main contract logic
│   │   ├── groth16.rs           # Groth16 ZK verifier
│   │   ├── sphincs.rs           # SPHINCS+ verifier
│   │   └── shake256.rs          # SHAKE256 hash function
│   ├── Cargo.toml
│   └── deploy.sh                # Deployment script
│
├── zk-circuits/                  # Circom ZK-SNARK circuits
│   ├── circuits/
│   │   ├── sphincs_main.circom  # Main verification circuit
│   │   ├── sphincs_fors.circom  # FORS tree verification
│   │   ├── keccak.circom        # Keccak-f[1600] for SHAKE256
│   │   └── utils.circom         # Utility templates
│   ├── scripts/                 # Compile, setup, prove scripts
│   └── build/                   # Compiled artifacts
│
├── demo-site/                    # Next.js demo application
│   ├── app/
│   │   ├── page.tsx             # Home page
│   │   ├── agent-builder/       # Visual agent builder
│   │   └── x402-test/           # X402 payment testing
│   └── components/              # React components
│
├── landing-page/                 # Marketing website
│   ├── app/                     # Next.js 15 App Router
│   └── src/
│       ├── components/          # 70+ UI components
│       ├── hooks/               # React hooks
│       ├── lib/                 # Utilities
│       ├── providers/           # Context providers
│       └── store/               # State management
│
├── verifier/                     # Standalone verification utilities
│
├── ARCHITECTURE.md               # Detailed technical architecture
├── QUANTUM_SAFE_ARCHITECTURE.md  # Quantum security explanation
├── EXTENSION_TEST_GUIDE.md       # Testing instructions
├── VERCEL_DEPLOYMENT.md          # Deployment guide
└── test-*.js                     # End-to-end test suite
```

---

## Features

### Core Quantum-Safe Wallet
- **Quantum-Safe Wallet Creation** - Generate SPHINCS+ keypairs (32B public key, 64B secret key) alongside standard Stellar Ed25519 keys
- **Account Locking** - Irreversibly disable Ed25519 (`masterWeight=0`), register SPHINCS+ public key with the smart contract, and add the contract as the sole authorized signer
- **Quantum-Safe Payments** - All transactions signed with SPHINCS+, compressed via ZK proofs, and authorized on-chain through the smart contract
- **Non-Custodial** - No private key is ever stored on the backend or the contract. Keys stay in Chrome's secure local storage

### Wallet Management
- **Multi-Wallet Support** - Create and manage multiple Stellar accounts
- **Wallet Import/Export** - Backup and restore wallet data
- **Balance Display** - Real-time XLM and multi-asset balance tracking with available balance calculation (respects liabilities and minimum balance)
- **Transaction History** - Full activity log of all wallet operations
- **QR Code Support** - Generate and scan QR codes for addresses

### DeFi / DEX
- **DEX Aggregation** - Multi-source liquidity aggregation across Stellar SDEX (native orderbook)
- **Token Swaps** - Exact-in and exact-out swaps with automatic trustline creation and path payment support
- **Real-Time Charts** - Live price charts powered by Lightweight Charts
- **Slippage Protection** - Configurable slippage tolerance and price impact calculation
- **Quote Expiration** - Time-limited quotes to protect against price movement

### Trading Agent Builder (Visual Programming)
- **Visual Editor** - ReactFlow-based drag-and-drop agent builder
- **Block Types** - Price Monitor, Swap Executor, Condition Evaluator, Alert/Notification blocks
- **Strategy Templates** - Pre-built trading strategy templates
- **Mock Execution** - Test agents without real funds
- **Live Execution** - Run agents on testnet or mainnet

### X402 Micropayments Protocol
- **Spending Accounts** - Separate Ed25519 keypair for fast micropayments
- **Per-Origin Policies** - Auto/prompt/deny permissions per website
- **Spending Limits** - Per-transaction and daily spending caps
- **Auto-Recharge** - Agent monitors low balance and tops up automatically
- **Activity Logging** - Full audit trail of all micropayments

### Payment Features
- **Simple Transfers** - Send XLM with memo support
- **Multi-Send** - Batch payments to multiple recipients in one operation
- **Payment Requests** - Request payment from another wallet
- **Multi-Wallet Send** - Send from multiple source wallets simultaneously

### Website Integration (Provider API)
- **Injected API** - `window.quantumStellar` API for dApp connectivity
- **Connection Approval** - User-controlled per-site permission management
- **Transaction Signing** - Websites can request transaction signatures
- **Event System** - `on`, `off`, `once` event subscription for dApps

### Webhooks
- **Custom Webhooks** - Register URLs for event-based notifications
- **Event Triggers** - Payment, error, and agent action triggers
- **Custom Headers** - Configurable webhook request headers

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** or **yarn**
- **Rust** and **Cargo** (for smart contract development)
- **Soroban CLI** (for contract deployment)
- **Chrome** or **Chromium-based browser** (for the extension)
- **circom** (for ZK circuit compilation, optional)

### 1. Chrome Extension (Wallet UI)

```bash
cd extension
npm install
npm run dev       # Development mode with watch
# or
npm run build     # Production build
```

**Load in Chrome:**
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist/` directory

### 2. Relayer Backend

```bash
cd relayer
npm install
cp .env.example .env   # Configure environment variables (see below)
npm run dev             # Development mode
# or
npm run build && npm start  # Production mode
```

The relayer runs on `http://localhost:3001` by default.

### 3. Demo Site

```bash
cd demo-site
npm install
npm run dev     # Starts on http://localhost:3000
```

### 4. Landing Page

```bash
cd landing-page
npm install
npm run dev     # Starts with Turbopack on http://localhost:3000
```

### 5. Soroban Smart Contract

```bash
cd soroban-verifier
cargo build --target wasm32-unknown-unknown --release
# Deploy using Soroban CLI
bash deploy.sh
```

### 6. ZK Circuits

```bash
cd zk-circuits
npm install
npm run compile   # Compile circom circuits
npm run setup     # Run trusted setup ceremony
npm run prove     # Generate a test proof
npm run test      # Run circuit tests
```

---

## API Reference

### Relayer Endpoints

**Base URL:** `http://localhost:3001` (development) | Your deployed URL (production)

#### Health Check

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "relayerPublicKey": "G...",
  "zkEnabled": true
}
```

#### Verify & Submit (Simplified Flow)

```
POST /api/verify-and-submit
```

Verifies a SPHINCS+ signature and submits the transaction directly.

| Field | Type | Description |
|-------|------|-------------|
| `stellarAddress` | `string` | Stellar public key (`G...`) |
| `txHash` | `string` | Transaction hash (hex) |
| `txXdr` | `string` | Transaction XDR (base64) |
| `sphincsSignature` | `string` | SPHINCS+ signature (base64) |

Response:
```json
{
  "success": true,
  "paymentTxHash": "abc123..."
}
```

#### Generate ZK Proof

```
POST /api/zk/generate-proof
```

Generates a ZK-SNARK proof for a SPHINCS+ signature. This is computationally intensive and may take 30-120 seconds.

| Field | Type | Description |
|-------|------|-------------|
| `stellarAddress` | `string` | Stellar public key |
| `txHash` | `string` | Transaction hash (hex) |
| `sphincsPublicKey` | `string` | SPHINCS+ public key (base64) |
| `sphincsSignature` | `string` | SPHINCS+ signature (base64) |

Response:
```json
{
  "success": true,
  "proofHex": "...",
  "publicInputsHex": "...",
  "provingTimeSeconds": 45.2
}
```

#### Submit with ZK Proof

```
POST /api/zk/submit
```

Submits a transaction with full ZK proof verification on-chain.

| Field | Type | Description |
|-------|------|-------------|
| `stellarAddress` | `string` | Stellar public key |
| `txHash` | `string` | Transaction hash (hex) |
| `txXdr` | `string` | Transaction XDR (base64) |
| `proofHex` | `string` | ZK proof (hex) |
| `publicInputsHex` | `string` | Public inputs (hex) |

#### Get Relayer Public Key

```
GET /public-key
```

Response:
```json
{
  "publicKey": "G..."
}
```

---

## Smart Contract Interface

**Contract Address:** `CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW`
**Network:** Stellar Testnet

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `register` | `stellar_address`, `sphincs_public_key` | `u64` | Register a SPHINCS+ public key for quantum-safe signing |
| `verify_zk_and_authorize` | `stellar_address`, `tx_hash`, `tx_xdr`, `proof_bytes`, `public_inputs_bytes` | `u64` | Verify ZK proof and authorize a transaction |
| `get_authorization_preimage` | `tx_hash` | `Option<Bytes>` | Get the preimage for sha256Hash signer verification |
| `verify_sphincs_signature` | `message`, `signature`, `public_key` | `bool` | On-chain SPHINCS+ signature verification (backup) |

### On-Chain Storage

```rust
// Registration mapping: Address -> Registration
Registration {
    sphincs_pk: Bytes,       // 32 bytes
    registered_at: u64,
}

// Pending approvals: nonce -> PendingApproval
PendingApproval {
    tx_hash: BytesN<32>,
    tx_xdr: Bytes,
    stellar_address: Address,
    approved_at: u64,
    expires_at: u64,         // 5-minute expiration
    consumed: bool,
}
```

---

## Environment Variables

### Relayer Service

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RELAYER_SECRET` | Yes | - | Stellar secret key (`S...`) for the relayer account |
| `CONTRACT_ID` | Yes | - | Soroban contract address (`C...`) |
| `NETWORK` | No | `testnet` | Network: `testnet` or `mainnet` |
| `HORIZON_URL` | No | `https://horizon-testnet.stellar.org` | Stellar Horizon API URL |
| `SOROBAN_RPC_URL` | No | `https://soroban-testnet.stellar.org` | Soroban RPC URL |
| `NETWORK_PASSPHRASE` | No | `Test SDF Network ; September 2015` | Stellar network passphrase |
| `POLL_INTERVAL_MS` | No | `5000` | Event polling interval (ms) |
| `APPROVAL_TIMEOUT_MS` | No | `300000` | Pending approval timeout (ms) |

### Extension (Hardcoded Config)

| Constant | Value | Description |
|----------|-------|-------------|
| `RELAYER_URL` | `http://localhost:3001` (dev) / `https://nebula-ext.vercel.app` (prod) | Relayer service endpoint |
| `CONTRACT_ID` | `CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW` | Soroban contract address |
| `NETWORK` | Stellar Testnet | Target blockchain network |

---

## Testing

The project includes comprehensive end-to-end tests at the repository root:

```bash
# Full quantum-safe transaction flow
node test-complete-quantum-flow.js

# End-to-end quantum safety verification
node test-quantum-safe-e2e.js

# General end-to-end flow
node test-e2e-flow.js

# Relayer API integration tests
node test-relayer-api-e2e.js

# SPHINCS+ signature tests
node test-sphincs-proper.js

# Simple payment test
node test-simple-send.js

# Performance benchmarking
node test-perf.js
```

For step-by-step extension testing, see [EXTENSION_TEST_GUIDE.md](./EXTENSION_TEST_GUIDE.md).

---

## Performance Metrics

| Operation | Duration | Output Size |
|-----------|----------|-------------|
| SPHINCS+ Key Generation | < 100ms | 32B public key, 64B secret key |
| SPHINCS+ Signing | < 500ms | ~17KB signature |
| ZK Proof Generation | 30 - 120s | 192 bytes |
| On-Chain ZK Verification | < 1s | - |
| Full Quantum-Safe Transaction | 35 - 130s | - |

---

## Security Model

### Trust Assumptions

| Component | Trust Level | Rationale |
|-----------|-------------|-----------|
| **SPHINCS+** | Cryptographic | NIST FIPS 205 standardized; 128-bit post-quantum security |
| **ZK-SNARKs (Groth16)** | Cryptographic + Setup | Trusted setup required; proofs are sound under BLS12-381 |
| **Soroban Contract** | Code Audit | Open-source; no admin keys; immutable once deployed |
| **Relayer** | Semi-Trusted | Cannot forge signatures or proofs; can only delay/censor (not steal) |
| **Browser Extension** | User Device | Keys stored locally; security depends on device |

### Key Security Properties

1. **Quantum Resistance** - SPHINCS+ signatures provide 128-bit post-quantum security (NIST Level 1)
2. **No Private Key Exposure** - The smart contract has no private key; it authorizes via proof verification only
3. **Ed25519 Fully Disabled** - `masterWeight=0` ensures the quantum-vulnerable key can never sign
4. **Zero-Knowledge Privacy** - The full SPHINCS+ signature is never submitted on-chain, only the ZK proof
5. **Approval Expiration** - Pending transaction approvals expire after 5 minutes
6. **Per-Site Permissions** - dApp connections require explicit user approval
7. **Spending Limits** - X402 micropayments enforce per-transaction and daily caps

---

## Deployment

### Relayer (Vercel)

```bash
cd relayer
# Set environment variables in Vercel dashboard
vercel deploy
```

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed instructions.

### Smart Contract (Stellar Testnet)

```bash
cd soroban-verifier
bash deploy.sh
```

### Extension

```bash
cd extension
npm run build
# Upload dist/ to Chrome Web Store or load unpacked
```

### Demo Site & Landing Page

Both are standard Next.js applications deployable to Vercel, Netlify, or any Node.js host:

```bash
# Demo site
cd demo-site && npm run build && npm start

# Landing page
cd landing-page && npm run build && npm start
```

---

## Future Roadmap

- Complete ZK circuit optimization for practical proving times (target: < 10s)
- Integrate WASM-based SPHINCS+ for production-grade performance
- Add real-time event monitoring and advanced error handling
- Security audits and mainnet deployment
- Support for multiple asset types and token standards
- Hardware wallet integration for SPHINCS+ key storage
- Mobile wallet companion app
- Cross-chain quantum-safe bridge

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Comprehensive technical architecture (system design, crypto foundations, data structures) |
| [QUANTUM_SAFE_ARCHITECTURE.md](./QUANTUM_SAFE_ARCHITECTURE.md) | Deep dive into the quantum security model and transaction flows |
| [EXTENSION_TEST_GUIDE.md](./EXTENSION_TEST_GUIDE.md) | Step-by-step guide for testing the Chrome extension |
| [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) | Relayer deployment guide for Vercel |
| [extension/src/modules/ARCHITECTURE.md](./extension/src/modules/ARCHITECTURE.md) | Modular extension architecture (wallet, DEX, execution, network layers) |
| [zk-circuits/README.md](./zk-circuits/README.md) | ZK circuit structure, setup, and usage |
| [demo-site/README.md](./demo-site/README.md) | Demo site features and setup |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

MIT License - See [LICENSE](./LICENSE) for details.
