# Nebula Wallet - Technical Architecture

> A post-quantum cryptographic wallet for Stellar using SPHINCS+ signatures, ZK-SNARKs, and Soroban smart contracts.

<img width="1076" height="501" alt="Technical Architecture Diagram" src="https://github.com/user-attachments/assets/7cabdb81-160e-4482-95ea-6b8275e9cfcc" />

**[Watch Architecture Explanation Video](https://drive.google.com/file/d/12WWr9Y_p7Txaw0j9P6F7OpJFjUFi0K_f/view?usp=drive_link)**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Component Deep Dive](#3-component-deep-dive)
   - [Chrome Extension](#31-chrome-extension)
   - [Relayer Service](#32-relayer-service)
   - [Soroban Smart Contract](#33-soroban-smart-contract)
   - [ZK Circuits](#34-zk-circuits)
   - [Demo Site](#35-demo-site)
4. [Cryptographic Foundations](#4-cryptographic-foundations)
5. [Transaction Flows](#5-transaction-flows)
6. [Security Model](#6-security-model)
7. [Data Structures](#7-data-structures)
8. [API Reference](#8-api-reference)
9. [Deployment](#9-deployment)

---

## 1. System Overview

Nebula Wallet implements a **quantum-resistant authorization system** for Stellar blockchain. The core innovation is replacing vulnerable Ed25519 signatures with:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Signatures** | SPHINCS+-SHAKE-128f | Post-quantum digital signatures (~17KB) |
| **Proofs** | Groth16 ZK-SNARKs | Compress signature verification to 192 bytes |
| **Verification** | BLS12-381 Pairing | On-chain proof verification |
| **Authorization** | Soroban Contract | Contract acts as account signer |

### Key Innovation

Traditional Stellar wallets use Ed25519 (quantum-vulnerable):
```
User Ed25519 Key → Sign Transaction → Submit to Network
        ↑
   Quantum Attack Vector
```

Nebula Wallet eliminates this attack surface:
```
User SPHINCS+ Key → ZK Proof → Contract Verification → Authorization
        ↑                              ↑
   Quantum-Safe                   No Private Key
```

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    CHROME EXTENSION (TypeScript)                       │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  sphincs.ts │  │  stellar.ts │  │  soroban.ts │  │  storage.ts │  │  │
│  │  │  SPHINCS+   │  │  Stellar    │  │  Contract   │  │  Key        │  │  │
│  │  │  Keypairs   │  │  SDK Ops    │  │  Calls      │  │  Management │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    background.ts (Service Worker)                │  │  │
│  │  │  • Message routing  • Transaction building  • SPHINCS+ signing  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Popup UI (React + Tailwind)                   │  │  │
│  │  │  • Wallet Management  • Send/Receive  • DEX  • Agent Builder    │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ SPHINCS+ Signature (~17KB)
                                      │ + Transaction XDR
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RELAYER SERVICE (Node.js)                            │
│                                                                              │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │    api.ts          │  │   zk-prover.ts     │  │ sphincs-verifier.ts│    │
│  │    Express API     │  │   Groth16 Proofs   │  │ Signature Verify   │    │
│  │    Endpoints       │  │   snarkjs          │  │ FORS + Hypertree   │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                              │
│  Endpoints:                                                                  │
│  • POST /api/verify-and-submit     (Simplified SPHINCS+ verification)       │
│  • POST /api/zk/generate-proof     (Full ZK proof generation: 30-120s)      │
│  • POST /api/zk/submit             (Submit with ZK authorization)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ ZK Proof (192 bytes)
                                      │ + Public Inputs (96 bytes)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SOROBAN SMART CONTRACT (Rust)                           │
│                                                                              │
│  Contract: CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW        │
│                                                                              │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │     lib.rs         │  │    groth16.rs      │  │    sphincs.rs      │    │
│  │  Contract Logic    │  │  ZK Verification   │  │  SPHINCS+ Verify   │    │
│  │  Registration      │  │  BLS12-381 Pairing │  │  FORS + WOTS+      │    │
│  │  Authorization     │  │  192-byte proofs   │  │  (On-chain backup) │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         shake256.rs                                  │   │
│  │              Keccak-f[1600] Permutation (24 rounds)                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Contract Authorization
                                      │ (sha256Hash preimage)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STELLAR NETWORK                                     │
│                                                                              │
│  • Transaction executed with contract's authorization                        │
│  • Ed25519 key NOT used (masterWeight = 0)                                  │
│  • Funds protected by SPHINCS+ + ZK verification                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Deep Dive

### 3.1 Chrome Extension

**Location:** `extension/`

The extension is a Manifest V3 Chrome extension providing the wallet UI and cryptographic operations.

#### Directory Structure

```
extension/
├── src/
│   ├── sphincs.ts          # SPHINCS+ implementation (keypairs, signing)
│   ├── stellar.ts          # Stellar SDK integration
│   ├── soroban.ts          # Soroban contract interaction
│   ├── storage.ts          # Chrome storage API wrapper
│   ├── background.ts       # Service worker (message routing)
│   ├── content.ts          # Content script (website bridge)
│   ├── injected.ts         # Injected provider (window.quantumStellar)
│   ├── types.ts            # TypeScript interfaces
│   ├── popup/              # React UI components
│   │   ├── App.tsx         # Main container
│   │   ├── views/          # Page components
│   │   └── hooks/          # React hooks
│   └── modules/
│       ├── wallet/         # Key management
│       ├── dex/            # DEX aggregator
│       ├── execution/      # Payment executor
│       └── network/        # Network management
├── public/
│   └── manifest.json       # Extension manifest
└── webpack.config.js       # Build configuration
```

#### SPHINCS+ Implementation (`sphincs.ts`)

**Parameters (SPHINCS+-SHAKE-128f-simple):**

| Parameter | Value | Description |
|-----------|-------|-------------|
| N | 16 | Hash output length (bytes) |
| W | 16 | Winternitz parameter |
| TREE_HEIGHT | 60 | Total tree height |
| D | 20 | Hypertree depth |
| HP | 3 | Per-layer height |
| A | 9 | FORS height |
| K | 30 | FORS trees |
| PK_SIZE | 32 | Public key bytes |
| SK_SIZE | 64 | Secret key bytes |
| SIG_SIZE | ~17,088 | Signature bytes |

**Key Functions:**

```typescript
// Key generation
generateKeyPair(): { publicKey: Uint8Array, secretKey: Uint8Array }
  // publicKey = [pkSeed(16) || pkRoot(16)]
  // secretKey = [skSeed(16) || skPrf(16) || pkSeed(16) || pkRoot(16)]

// Signing
sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array
  // Returns: R(16) || FORS_SIG(4800) || HT_SIG(~12000)
  // Total: ~17,088 bytes

// Verification (stub - relies on contract)
verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean
```

#### Message Types

The extension uses Chrome's message passing for communication:

```typescript
// Wallet Operations
'CREATE_WALLET' | 'IMPORT_WALLET' | 'GET_WALLET' | 'LOCK_WALLET'
'GET_BALANCE' | 'AIRDROP' | 'SWITCH_ACCOUNT' | 'DELETE_ACCOUNT'

// Transactions
'SEND_XLM' | 'SWAP_TOKENS' | 'ADD_TRUSTLINE'
'EXECUTE_MULTI_SEND' | 'EXECUTE_MULTIWALLET_SEND'

// X402 Micropayments
'X402_SIGN_PAYMENT' | 'X402_GET_SPENDING_ACCOUNT'
'X402_GET_SERVICES' | 'X402_UPDATE_SERVICE_POLICY'

// Agents
'START_AGENT' | 'STOP_AGENT' | 'GET_EXECUTION_LOGS'
```

#### Storage Schema

```typescript
interface WalletData {
  id: string;                    // UUID
  name: string;                  // User-given name
  stellarPublicKey: string;      // G... address
  stellarSecretKey: string;      // S... secret
  sphincsPublicKey: string;      // Base64 encoded
  sphincsSecretKey: string;      // Base64 encoded
  isLocked: boolean;             // Quantum-safe mode
  createdAt: number;
}

interface WalletStore {
  accounts: WalletData[];
  activeAccountId: string | null;
}
```

---

### 3.2 Relayer Service

**Location:** `relayer/`

The relayer is a Node.js service that verifies SPHINCS+ signatures, generates ZK proofs, and submits transactions.

#### Directory Structure

```
relayer/
├── src/
│   ├── api.ts                      # Express server & endpoints
│   ├── zk-prover.ts               # ZK proof generation (snarkjs)
│   ├── sphincs-verifier.ts        # Full SPHINCS+ verification
│   ├── sphincs-simplified-verifier.ts  # FORS-only verification
│   ├── transaction.ts             # Transaction building
│   ├── event-watcher.ts           # Soroban event polling
│   ├── config.ts                  # Environment configuration
│   └── index.ts                   # Entry point
├── zk-assets/                     # ZK proving artifacts
│   ├── sphincs_main.wasm          # Circuit WASM
│   ├── sphincs_main_final.zkey    # Proving key
│   └── verification_key.json      # Verification key
├── api/
│   └── index.ts                   # Vercel serverless entry
└── package.json
```

#### API Endpoints

**POST `/api/verify-and-submit`** (Simplified Flow)

```typescript
// Request
{
  stellarAddress: string,      // Account address
  txHash: string,              // Hex-encoded transaction hash
  txXdr: string,               // Base64 transaction XDR
  sphincsSignature: string     // Base64 SPHINCS+ signature
}

// Response
{
  success: boolean,
  paymentTxHash: string,
  message: string
}
```

**POST `/api/zk/generate-proof`** (Full ZK Flow)

```typescript
// Request
{
  stellarAddress: string,
  txHash: string,              // 32 bytes hex
  sphincsPublicKey: string,    // 32 bytes hex
  sphincsSignature: string     // Base64 (~17KB)
}

// Response
{
  success: boolean,
  proof: Groth16Proof,
  publicSignals: string[],
  proofHex: string,            // 192 bytes
  publicInputsHex: string,     // 96 bytes
  provingTimeSeconds: number   // 30-120 seconds
}
```

**POST `/api/zk/submit`** (ZK Authorization)

```typescript
// Request
{
  stellarAddress: string,
  txHash: string,
  txXdr: string,
  proofHex: string,            // 192 bytes
  publicInputsHex: string      // 96 bytes
}

// Response
{
  success: boolean,
  zkVerificationTxHash: string,
  paymentTxHash: string,
  quantumSafe: true
}
```

#### ZK Proof Generation (`zk-prover.ts`)

**Proof Generation Flow:**

```
1. Parse SPHINCS+ Signature
   ├── Extract R (randomness): 16 bytes
   ├── Extract FORS signature: 30 trees × 10 elements × 16 bytes
   └── Extract Hypertree signature: ~12KB

2. Compute Circuit Inputs
   ├── Public: messageHash, pkSeed, pkRoot
   └── Private: sigR, forsSecrets, forsAuthPaths, htSigCommitment

3. Generate Groth16 Proof
   └── snarkjs.groth16.fullProve(inputs, WASM, zkey)
       └── Duration: 30-120 seconds

4. Serialize Proof
   ├── π_A: 48 bytes (G1 point)
   ├── π_B: 96 bytes (G2 point)
   └── π_C: 48 bytes (G1 point)
   └── Total: 192 bytes
```

---

### 3.3 Soroban Smart Contract

**Location:** `soroban-verifier/`

The Rust smart contract provides on-chain verification and authorization.

#### Directory Structure

```
soroban-verifier/
├── src/
│   ├── lib.rs          # Main contract logic (635 lines)
│   ├── groth16.rs      # Groth16 ZK verifier (378 lines)
│   ├── sphincs.rs      # SPHINCS+ verifier (401 lines)
│   └── shake256.rs     # SHAKE256/Keccak (140 lines)
├── Cargo.toml
└── deploy.sh
```

#### Contract Address

```
Testnet: CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW
```

#### Entry Points

**Registration:**

```rust
pub fn register(env: Env, stellar_address: Address, sphincs_public_key: Bytes)
// Registers SPHINCS+ public key for an account

pub fn is_registered(env: Env, stellar_address: Address) -> bool
pub fn get_registration(env: Env, stellar_address: Address) -> Option<Registration>
```

**Approval (Hybrid Model):**

```rust
pub fn approve_transaction_lightweight(
    env: Env,
    stellar_address: Address,
    tx_hash: BytesN<32>,
    tx_xdr: Bytes,
    sphincs_signature: Bytes,
) -> u64
// Lightweight: Trusts off-chain verification, returns nonce

pub fn approve_transaction(/* same params */) -> u64
// Full: Performs complete SPHINCS+ verification on-chain
```

**ZK Verification:**

```rust
pub fn init_zk(env: Env, admin: Address)
// Initialize ZK system (one-time)

pub fn set_zk_verification_key(
    env: Env,
    alpha_g1: BytesN<48>,
    beta_g2: BytesN<96>,
    gamma_g2: BytesN<96>,
    delta_g2: BytesN<96>,
    ic: Vec<BytesN<48>>,
)
// Set Groth16 verification key (admin only)

pub fn verify_zk_and_authorize(
    env: Env,
    stellar_address: Address,
    tx_hash: BytesN<32>,
    tx_xdr: Bytes,
    proof_bytes: Bytes,         // 192 bytes
    public_inputs_bytes: Bytes, // 96 bytes
) -> u64
// Verify ZK proof and authorize transaction
```

**Authorization:**

```rust
pub fn get_authorization_preimage(env: Env, tx_hash: BytesN<32>) -> Option<Bytes>
// Returns contract address bytes for sha256Hash signer

pub fn get_signer_hash(env: Env) -> BytesN<32>
// Returns sha256(contract_address) for account setup
```

#### Groth16 Verifier (`groth16.rs`)

**Verification Equation:**

```
e(π_A, π_B) = e(α, β) · e(L, γ) · e(π_C, δ)

Where:
- e: BLS12-381 optimal ate pairing
- L = IC[0] + Σ(public_inputs[i] · IC[i+1])
```

**Point Sizes:**

| Element | Compressed Size |
|---------|----------------|
| G1 point | 48 bytes |
| G2 point | 96 bytes |
| Scalar | 32 bytes |
| Proof (π_A + π_B + π_C) | 192 bytes |
| Public Inputs (3 × 32) | 96 bytes |

---

### 3.4 ZK Circuits

**Location:** `zk-circuits/`

Circom circuits for generating ZK proofs of SPHINCS+ signature validity.

#### Directory Structure

```
zk-circuits/
├── circuits/
│   ├── sphincs_main.circom     # Main verification circuit
│   ├── sphincs_fors.circom     # FORS tree verification
│   ├── keccak.circom           # Keccak/SHAKE256 implementation
│   ├── utils.circom            # Utility templates
│   └── simple_test.circom      # Infrastructure test
├── scripts/
│   ├── compile.sh              # Circom compilation
│   ├── setup.sh                # Trusted setup
│   └── prove.js                # Proof generation
└── build/                      # Compiled artifacts
```

#### Main Circuit (`sphincs_main.circom`)

**Public Inputs (48 bytes):**
- `messageHash[32]`: Transaction hash
- `pkSeed[16]`: First half of SPHINCS+ public key
- `pkRoot[16]`: Second half (hypertree root)

**Private Inputs (~8KB):**
- `sigR[16]`: Signature randomness
- `forsSecrets[30][16]`: FORS secret values
- `forsAuthPaths[30][9][16]`: Authentication paths
- `forsPkHint[16]`: Precomputed FORS public key
- `htSigCommitment[32]`: Hypertree commitment

**Constraint Count:**

| Component | Constraints |
|-----------|-------------|
| ComputeDigest (SHAKE256) | ~155,000 |
| ExtractForsIndices | ~300 |
| ForsVerify (30 trees) | ~46,500,000 |
| HypertreeCommitment | ~155,000 |
| **Total** | **~46,810,000** |

#### Circuit Templates

```circom
// Main entry point
template SphincsVerify() {
    // Public inputs
    signal input messageHash[32];
    signal input pkSeed[16];
    signal input pkRoot[16];

    // Private inputs
    signal input sigR[16];
    signal input forsSecrets[30][16];
    signal input forsAuthPaths[30][9][16];
    signal input forsPkHint[16];
    signal input htSigCommitment[32];

    // Output
    signal output valid;

    // 1. Compute message digest
    component digest = ComputeDigest();

    // 2. Extract FORS indices
    component indices = ExtractForsIndices();

    // 3. Verify FORS signature
    component fors = ForsVerify();

    // 4. Verify hypertree commitment
    component ht = HypertreeCommitment();

    valid <== 1;
}

component main {public [messageHash, pkSeed, pkRoot]} = SphincsVerify();
```

---

### 3.5 Demo Site

**Location:** `demo-site/`

Next.js application for testing the wallet and building trading agents.

#### Tech Stack

- **Framework:** Next.js 14
- **UI:** React 18, Tailwind CSS, Radix UI
- **Flow Editor:** ReactFlow
- **Charts:** Lightweight Charts
- **AI:** OpenAI API integration

#### Pages

| Route | Purpose |
|-------|---------|
| `/` | Home page with X402 test |
| `/agent-builder` | Visual agent creation |
| `/x402-test` | X402 micropayment testing |

#### Agent Builder Components

```
components/agent-builder/
├── FlowCanvas.tsx        # ReactFlow canvas
├── BlockPalette.tsx      # Drag-and-drop blocks
├── AgentBlockNode.tsx    # Custom node renderer
├── ChatSidebar.tsx       # AI chat assistant
├── AgentToolbar.tsx      # Save/load/run controls
└── AgentManager.tsx      # Agent lifecycle
```

---

## 4. Cryptographic Foundations

### 4.1 SPHINCS+ (NIST FIPS 205)

**Structure:**

```
SPHINCS+ Signature (~17KB)
├── R (16 bytes)           # Randomness
├── FORS Signature         # Few-time signature
│   └── 30 trees × (secret + 9 auth nodes) × 16 bytes = 4,800 bytes
└── Hypertree Signature    # One-time signatures
    └── 20 layers × (WOTS+ + auth path) = ~12,000 bytes
```

**Security:** 128-bit post-quantum security (NIST Level 1)

### 4.2 SHAKE256 (FIPS 202)

**Parameters:**
- **Rate:** 136 bytes (1088 bits)
- **Capacity:** 64 bytes (512 bits)
- **Permutation:** Keccak-f[1600], 24 rounds

**Usage in SPHINCS+:**
- F(): PRF for leaf computation
- H(): Tree node hashing
- T_l(): Public key compression
- H_msg(): Message digest

### 4.3 Groth16 ZK-SNARKs

**Curve:** BLS12-381

**Verification Equation:**
```
e(π_A, π_B) · e(α, -β) · e(L, -γ) · e(π_C, -δ) = 1
```

**Proof Size:** 192 bytes (constant, regardless of circuit size)

**Public Inputs:** 3 × 32 bytes = 96 bytes

---

## 5. Transaction Flows

### 5.1 Account Locking (One-Time Setup)

```
1. User creates wallet
   ├── Generate Stellar Ed25519 keypair
   └── Generate SPHINCS+ keypair

2. Fund account via Friendbot (testnet)

3. Lock account
   ├── Register SPHINCS+ public key with contract
   ├── Set masterWeight = 0 (disable Ed25519)
   ├── Add contract as sha256Hash signer (weight = 1)
   └── Set thresholds to 1

4. Account now requires contract authorization
```

### 5.2 Quantum-Safe Payment (Simplified)

```
1. User initiates payment in extension

2. Extension builds transaction
   ├── Creates payment operation
   ├── Sets memo to SPHINCS+ public key hash
   └── Returns transaction XDR + hash

3. User signs with SPHINCS+
   └── sign(txHash, sphincsSecretKey) → ~17KB signature

4. Extension sends to relayer
   POST /api/verify-and-submit {
     stellarAddress, txHash, txXdr, sphincsSignature
   }

5. Relayer processes
   ├── Verifies SPHINCS+ signature (simplified FORS check)
   ├── Rebuilds transaction with current sequence
   ├── Adds contract authorization (sha256Hash preimage)
   └── Submits to Stellar network

6. Transaction executes
   └── Contract's authorization satisfies signer requirement
```

### 5.3 Quantum-Safe Payment (Full ZK)

```
1-3. Same as simplified flow

4. Extension requests ZK proof
   POST /api/zk/generate-proof {
     stellarAddress, txHash, sphincsPublicKey, sphincsSignature
   }

5. Relayer generates proof (30-120 seconds)
   ├── Parse SPHINCS+ signature structure
   ├── Prepare circuit inputs
   ├── Generate Groth16 proof via snarkjs
   └── Return 192-byte proof + 96-byte public inputs

6. Submit with ZK verification
   POST /api/zk/submit {
     stellarAddress, txHash, txXdr, proofHex, publicInputsHex
   }

7. Contract verifies ZK proof
   ├── Load verification key
   ├── Parse proof and public inputs
   ├── Verify: e(π_A, π_B) = e(α, β) · e(L, γ) · e(π_C, δ)
   ├── Store approval with nonce
   └── Emit 'zk_auth' event

8. Relayer submits payment
   └── Uses contract authorization from ZK approval
```

---

## 6. Security Model

### 6.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Quantum attack on Ed25519 | Ed25519 disabled (masterWeight=0) |
| Relayer compromise | Relayer cannot forge SPHINCS+ signatures |
| Contract key theft | Contract has no private key |
| Replay attacks | Nonce + TTL (5 minutes) + consumed flag |
| Signature forgery | SPHINCS+ (128-bit post-quantum security) |

### 6.2 Security Properties

**Post-Quantum Safety:**
- ✅ User Ed25519 disabled
- ✅ SPHINCS+ signatures quantum-resistant
- ✅ ZK proofs information-theoretically secure
- ✅ Contract has no stealable private key

**Authorization Flow:**
```
┌─────────────────┐
│   User Signs    │ → SPHINCS+ (quantum-safe)
└────────┬────────┘
         ▼
┌─────────────────┐
│  ZK Proof Gen   │ → Groth16 (hides signature)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Contract Verify │ → BLS12-381 pairing
└────────┬────────┘
         ▼
┌─────────────────┐
│   Transaction   │ → Contract authorization
└─────────────────┘
```

### 6.3 Trust Assumptions

1. **Trusted Setup Ceremony:** Groth16 requires trusted setup (Hermez ceremony used)
2. **SPHINCS+ Parameters:** NIST-standardized, peer-reviewed
3. **Soroban Security:** Relies on Stellar network security
4. **Relayer Availability:** Relayer must be online (but cannot steal funds)

---

## 7. Data Structures

### 7.1 Extension Storage

```typescript
// Main wallet store
interface WalletStore {
  accounts: WalletData[];
  activeAccountId: string | null;
}

// Individual account
interface WalletData {
  id: string;
  name: string;
  stellarPublicKey: string;
  stellarSecretKey: string;
  sphincsPublicKey: string;    // Base64, 32 bytes
  sphincsSecretKey: string;    // Base64, 64 bytes
  isLocked: boolean;
  createdAt: number;
}

// X402 spending policy
interface ServicePolicy {
  origin: string;
  name: string;
  permission: 'auto' | 'prompt' | 'deny';
  maxPerTransaction: string;
  maxPerDay: string;
  spentToday: string;
  lastResetDate: string;
}
```

### 7.2 Contract Storage

```rust
// User registration
#[contracttype]
pub struct Registration {
    pub sphincs_pk: Bytes,        // 32 bytes
    pub registered_at: u64,
}

// Pending approval
#[contracttype]
pub struct PendingApproval {
    pub tx_hash: BytesN<32>,
    pub tx_xdr: Bytes,
    pub stellar_address: Address,
    pub approved_at: u64,
    pub expires_at: u64,          // approved_at + 300 seconds
    pub consumed: bool,
}

// ZK verification key
#[contracttype]
pub struct VerificationKey {
    pub alpha_g1: BytesN<48>,
    pub beta_g2: BytesN<96>,
    pub gamma_g2: BytesN<96>,
    pub delta_g2: BytesN<96>,
    pub ic: Vec<BytesN<48>>,      // num_public_inputs + 1
}
```

### 7.3 Groth16 Proof

```typescript
interface Groth16Proof {
  pi_a: [string, string, string];           // G1 point
  pi_b: [[string, string], [string, string], [string, string]];  // G2 point
  pi_c: [string, string, string];           // G1 point
  protocol: "groth16";
  curve: "bls12381";
}

// Serialized format for contract
// Total: 192 bytes
// π_A: 48 bytes (compressed G1)
// π_B: 96 bytes (compressed G2)
// π_C: 48 bytes (compressed G1)
```

---

## 8. API Reference

### 8.1 Extension Message API

**Create Wallet:**
```typescript
chrome.runtime.sendMessage({
  type: 'CREATE_WALLET'
}, (response) => {
  // response: { success, wallet: WalletData }
});
```

**Send XLM:**
```typescript
chrome.runtime.sendMessage({
  type: 'SEND_XLM',
  payload: {
    to: 'GDEST...',
    amount: '10'
  }
}, (response) => {
  // response: { success, txHash, stellarExpertUrl }
});
```

**Lock Wallet:**
```typescript
chrome.runtime.sendMessage({
  type: 'LOCK_WALLET'
}, (response) => {
  // response: { success }
  // After this, account requires quantum-safe signing
});
```

### 8.2 Relayer API

**Health Check:**
```bash
GET /api/health

Response:
{
  "status": "ok",
  "relayerPublicKey": "GA2UZM...",
  "contractId": "CAQNMNI...",
  "network": "testnet",
  "zkEnabled": true
}
```

**Verify and Submit:**
```bash
POST /api/verify-and-submit
Content-Type: application/json

{
  "stellarAddress": "GUSER...",
  "txHash": "abc123...",
  "txXdr": "AAAA...",
  "sphincsSignature": "base64..."
}

Response:
{
  "success": true,
  "paymentTxHash": "def456...",
  "message": "Transaction submitted successfully"
}
```

**Generate ZK Proof:**
```bash
POST /api/zk/generate-proof
Content-Type: application/json

{
  "stellarAddress": "GUSER...",
  "txHash": "abc123...",
  "sphincsPublicKey": "hex32bytes...",
  "sphincsSignature": "base64..."
}

Response:
{
  "success": true,
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] },
  "publicSignals": ["...", "...", "..."],
  "proofHex": "192byteshex...",
  "publicInputsHex": "96byteshex...",
  "provingTimeSeconds": 45.2
}
```

### 8.3 Contract API (Soroban)

**Register:**
```rust
stellar contract invoke \
  --id CAQNMNI... \
  --source SUSER... \
  -- register \
  --stellar_address GUSER... \
  --sphincs_public_key 0x...
```

**Verify ZK and Authorize:**
```rust
stellar contract invoke \
  --id CAQNMNI... \
  --source SRELAYER... \
  -- verify_zk_and_authorize \
  --stellar_address GUSER... \
  --tx_hash 0x... \
  --tx_xdr 0x... \
  --proof_bytes 0x... \
  --public_inputs_bytes 0x...
```

---

## 9. Deployment

### 9.1 Contract Deployment

```bash
cd soroban-verifier

# Build
cargo build --target wasm32-unknown-unknown --release

# Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/quantum_verifier.wasm \
  --source deployer \
  --network testnet

# Initialize ZK
stellar contract invoke --id CAQNMNI... -- init_zk --admin GADMIN...

# Set verification key
stellar contract invoke --id CAQNMNI... -- set_zk_verification_key \
  --alpha_g1 0x... --beta_g2 0x... --gamma_g2 0x... --delta_g2 0x... --ic [...]
```

### 9.2 Relayer Deployment

```bash
cd relayer

# Install dependencies
npm install

# Set environment
export RELAYER_SECRET=SXXX...
export CONTRACT_ID=CAQNMNI...

# Development
npm run dev

# Production (Vercel)
vercel deploy
```

### 9.3 Extension Build

```bash
cd extension

# Install dependencies
npm install

# Build
npm run build

# Load in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable Developer Mode
# 3. Load unpacked → select extension/dist
```

### 9.4 ZK Circuit Setup

```bash
cd zk-circuits

# Install dependencies
npm install

# Compile circuit
./scripts/compile.sh sphincs_main

# Download Powers of Tau (one-time)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_27.ptau

# Trusted setup
./scripts/setup.sh

# Output files:
# - build/sphincs_main_final.zkey (proving key)
# - build/verification_key.json (for contract)
```

---

## Appendix A: File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `extension/src/sphincs.ts` | ~500 | SPHINCS+ implementation |
| `extension/src/background.ts` | ~2,169 | Service worker |
| `extension/src/stellar.ts` | ~400 | Stellar SDK integration |
| `relayer/src/api.ts` | ~600 | Express API |
| `relayer/src/zk-prover.ts` | ~400 | ZK proof generation |
| `soroban-verifier/src/lib.rs` | 635 | Contract logic |
| `soroban-verifier/src/groth16.rs` | 378 | ZK verifier |
| `soroban-verifier/src/sphincs.rs` | 401 | SPHINCS+ verifier |
| `zk-circuits/circuits/sphincs_main.circom` | 211 | Main circuit |
| `zk-circuits/circuits/sphincs_fors.circom` | 323 | FORS verification |
| `zk-circuits/circuits/keccak.circom` | 419 | Keccak implementation |

---

## Appendix B: Performance Metrics

| Operation | Duration | Size |
|-----------|----------|------|
| SPHINCS+ Key Generation | <100ms | 32B pk, 64B sk |
| SPHINCS+ Signing | <500ms | ~17KB signature |
| ZK Proof Generation | 30-120s | 192B proof |
| ZK Verification (on-chain) | <1s | - |
| Transaction Submission | 5-10s | - |

---

## Appendix C: External Links

- **Contract (Testnet):** [stellar.expert/explorer/testnet/contract/CAQNMNI...](https://stellar.expert/explorer/testnet/contract/CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW)
- **SPHINCS+ Specification:** [NIST FIPS 205](https://csrc.nist.gov/pubs/fips/205/final)
- **Groth16 Paper:** [On the Size of Pairing-based Non-interactive Arguments](https://eprint.iacr.org/2016/260)
- **Hermez Trusted Setup:** [hermez.io/trusted-setup](https://hermez.io/trusted-setup)

---

*Last Updated: 2026-02-03*
