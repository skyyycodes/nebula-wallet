# Nebula Wallet - Technical Architecture

> A post-quantum cryptographic wallet for Stellar using SPHINCS+ signatures, ZK-SNARKs, and Soroban smart contracts.

<img width="1076" height="501" alt="Technical Architecture Diagram" src="https://github.com/user-attachments/assets/7cabdb81-160e-4482-95ea-6b8275e9cfcc" />

**[Watch Architecture Explanation Video]([https://drive.google.com/file/d/1dlyoI6VWXutEAfDx8c70KoapQMH2m3lR/view?usp=drive_link])**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Component Deep Dive](#3-component-deep-dive)
4. [Cryptographic Foundations](#4-cryptographic-foundations)
5. [Transaction Flows](#5-transaction-flows)
6. [Security Model](#6-security-model)
7. [Data Structures](#7-data-structures)
8. [API Reference](#8-api-reference)
9. [Deployment](#9-deployment)

---

## 1. System Overview

### The Quantum Threat

Current blockchain wallets, including those on Stellar, rely on Ed25519 digital signatures. While secure against classical computers, Ed25519 is vulnerable to quantum computers running Shor's algorithm. When large-scale quantum computers become available (estimated within 10-15 years), they could derive private keys from public keys, allowing attackers to drain any wallet whose public key has been exposed on-chain.

This isn't a theoretical concern—every transaction you make today reveals your public key, creating a permanent record that future quantum computers could exploit. Even if you move funds later, historical transactions remain vulnerable.

### Our Solution

Nebula Wallet addresses this threat by completely replacing the vulnerable Ed25519 signing mechanism with a quantum-resistant alternative. Instead of using Ed25519 keys to authorize transactions, we:

1. **Disable Ed25519 entirely** by setting the account's master weight to zero
2. **Use SPHINCS+** (a NIST-approved post-quantum signature scheme) for user authentication
3. **Compress the large signatures** (~17KB) into tiny ZK proofs (192 bytes) using Groth16 ZK-SNARKs
4. **Verify proofs on-chain** via a Soroban smart contract that acts as the account's sole authorized signer

The result is a wallet where the authorization path contains no quantum-vulnerable cryptography. Even if an attacker gains access to a quantum computer, they cannot forge the SPHINCS+ signatures required to move funds.

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Signatures** | SPHINCS+-SHAKE-128f | Post-quantum digital signatures (~17KB) |
| **Proofs** | Groth16 ZK-SNARKs | Compress signature verification to 192 bytes |
| **Verification** | BLS12-381 Pairing | On-chain proof verification |
| **Authorization** | Soroban Contract | Contract acts as account signer |

### Why This Approach?

We chose this architecture for several reasons:

- **SPHINCS+** is the most conservative choice among NIST's post-quantum standards. Unlike lattice-based schemes, its security relies only on hash function properties, which are well-understood and quantum-resistant.

- **ZK-SNARKs** solve the practical problem of SPHINCS+'s large signature size. A 17KB signature would be expensive to store and verify on-chain, but a 192-byte proof is comparable to traditional signatures.

- **Contract-as-signer** eliminates the need for any private key in the authorization chain. The contract verifies proofs and provides authorization—there's no key that can be stolen or broken.

---

## 2. Architecture Diagram

The system consists of four main components that work together to enable quantum-safe transactions. Here's how data flows through the system:

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
│  │  Registration      │  │  BLS12-381 Pairing │  │  (On-chain backup) │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Contract Authorization
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STELLAR NETWORK                                     │
│                                                                              │
│  • Transaction executed with contract's authorization                        │
│  • Ed25519 key NOT used (masterWeight = 0)                                  │
│  • Funds protected by SPHINCS+ + ZK verification                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Explained

**Step 1: User Initiates Transaction**
When a user wants to send funds, the Chrome extension builds a standard Stellar transaction. However, instead of signing it with Ed25519, the extension signs the transaction hash using the user's SPHINCS+ private key, producing a ~17KB signature.

**Step 2: Relayer Processes the Signature**
The extension sends the transaction and signature to our relayer service. The relayer has two jobs: first, it verifies the SPHINCS+ signature is valid (ensuring the user actually authorized this transaction). Second, it generates a ZK proof—a cryptographic certificate that says "I verified a valid SPHINCS+ signature for this transaction" without revealing the actual signature.

**Step 3: Contract Verifies and Authorizes**
The ZK proof (just 192 bytes) is submitted to our Soroban smart contract. The contract verifies the proof using elliptic curve pairings. If valid, the contract provides its authorization for the transaction. Since the user's account was configured to require this contract's approval (and the Ed25519 key was disabled), the transaction can now execute.

**Step 4: Transaction Executes**
The Stellar network sees a properly authorized transaction and executes it. The key insight is that no quantum-vulnerable cryptography was used in the authorization chain—only SPHINCS+ (quantum-safe) and ZK proofs (information-theoretically secure).

---

## 3. Component Deep Dive

### 3.1 Chrome Extension

**Location:** `extension/`

The Chrome extension is the user-facing component of Nebula Wallet. It manages keys, builds transactions, and provides the UI for all wallet operations. Built as a Manifest V3 extension, it runs entirely in the user's browser—private keys never leave the device.

#### What It Does

The extension serves three primary functions:

1. **Key Management**: Generates and stores both Stellar Ed25519 keys (for account creation) and SPHINCS+ keys (for quantum-safe signing). Keys are stored encrypted in Chrome's local storage.

2. **Transaction Building**: Constructs Stellar transactions for payments, swaps, and other operations. It integrates with the Stellar SDK to handle all the complexity of Stellar's transaction format.

3. **SPHINCS+ Signing**: When a transaction needs to be sent, the extension signs the transaction hash with the user's SPHINCS+ private key. This is the core security operation—it proves the user authorized the transaction.

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
│   └── popup/              # React UI components
├── public/
│   └── manifest.json       # Extension manifest
└── webpack.config.js       # Build configuration
```

#### SPHINCS+ Implementation

Our SPHINCS+ implementation follows the NIST FIPS 205 specification for the SHAKE-128f-simple variant. This variant prioritizes signing speed over signature size—important for good user experience, even though the signatures are large.

**Key Parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| N | 16 | Hash output length (bytes) |
| W | 16 | Winternitz parameter |
| TREE_HEIGHT | 60 | Total tree height (supports 2^60 signatures) |
| D | 20 | Hypertree depth (20 layers of subtrees) |
| K | 30 | FORS trees (for few-time signatures) |
| PK_SIZE | 32 | Public key bytes |
| SK_SIZE | 64 | Secret key bytes |
| SIG_SIZE | ~17,088 | Signature bytes |

**Key Functions:**

```typescript
// Generate a new SPHINCS+ keypair
generateKeyPair(): { publicKey: Uint8Array, secretKey: Uint8Array }

// Sign a message (transaction hash)
sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array
// Returns ~17KB signature

// Verification is delegated to the smart contract
verify(signature, message, publicKey): boolean
```

#### Account Locking

A critical feature is "account locking"—the one-time process that converts a regular Stellar account into a quantum-safe account. When locked:

1. The Ed25519 master key weight is set to 0 (it can no longer sign)
2. The smart contract is added as a signer with weight 1
3. The user's SPHINCS+ public key is registered with the contract

After locking, the only way to authorize transactions is through the contract, which requires valid SPHINCS+ signatures.

---

### 3.2 Relayer Service

**Location:** `relayer/`

The relayer is a Node.js service that bridges the gap between the user's browser and the blockchain. It performs computationally intensive operations that would be impractical to run in a browser or too expensive to run on-chain.

#### Why We Need a Relayer

Two operations in our system are too heavy for certain environments:

1. **SPHINCS+ Verification**: Verifying a SPHINCS+ signature requires hashing through a tree of 2^60 possible leaves. While the verification itself is fast (~100ms), it's complex to implement correctly and would bloat the extension.

2. **ZK Proof Generation**: Creating a Groth16 proof for our circuit takes 30-120 seconds and requires significant RAM. This must happen on a server, not in a browser.

The relayer handles both operations. Importantly, the relayer cannot steal funds—it can only verify signatures and generate proofs. Without a valid SPHINCS+ signature from the user, the relayer is powerless.

#### Directory Structure

```
relayer/
├── src/
│   ├── api.ts                      # Express server & endpoints
│   ├── zk-prover.ts               # ZK proof generation
│   ├── sphincs-verifier.ts        # Full SPHINCS+ verification
│   ├── sphincs-simplified-verifier.ts  # Fast FORS-only verification
│   ├── transaction.ts             # Transaction building
│   └── config.ts                  # Environment configuration
├── zk-assets/                     # ZK proving artifacts
│   ├── sphincs_main.wasm          # Compiled circuit
│   ├── sphincs_main_final.zkey    # Proving key (~50MB)
│   └── verification_key.json      # Verification key
└── package.json
```

#### API Endpoints

The relayer exposes three main endpoints:

**`POST /api/verify-and-submit`** — The simplified flow for most transactions. The relayer verifies the SPHINCS+ signature using a fast FORS-only check, then submits the transaction with contract authorization. This is faster but relies on trust in the relayer.

**`POST /api/zk/generate-proof`** — Generates a full ZK proof. Takes 30-120 seconds but creates cryptographic proof that can be verified by anyone, including the smart contract.

**`POST /api/zk/submit`** — Submits a transaction using ZK-verified authorization. The smart contract verifies the proof on-chain, providing the strongest security guarantees.

#### ZK Proof Generation

The proof generation process transforms a ~17KB SPHINCS+ signature into a 192-byte ZK proof:

1. **Parse Signature**: Extract the randomness (R), FORS signature, and hypertree signature from the SPHINCS+ signature.

2. **Prepare Inputs**: Convert signature components into the format expected by our Circom circuit. Public inputs include the transaction hash and public key; private inputs include the signature details.

3. **Generate Proof**: Run snarkjs with our compiled circuit and proving key. This is the slow step—it involves complex elliptic curve operations.

4. **Serialize**: Convert the proof to a compact 192-byte format for on-chain verification.

---

### 3.3 Soroban Smart Contract

**Location:** `soroban-verifier/`

The smart contract is the trust anchor of our system. It's deployed on Stellar's Soroban platform and serves as the sole authorized signer for locked accounts. Written in Rust, it implements both SPHINCS+ verification (as a backup) and Groth16 ZK proof verification.

#### Why a Smart Contract?

The contract solves a fundamental problem: how do you authorize a transaction without using a private key that could be stolen or broken?

Our answer: use a contract that has no private key. The contract verifies cryptographic proofs and, if valid, provides its authorization. Since the contract's authorization comes from code execution (not a private key), there's nothing for an attacker to steal.

When a user locks their account, they configure Stellar to require the contract's approval. The contract will only approve transactions backed by valid SPHINCS+ signatures (proven via ZK proofs).

#### Contract Structure

```
soroban-verifier/
├── src/
│   ├── lib.rs          # Main contract logic
│   ├── groth16.rs      # ZK proof verifier
│   ├── sphincs.rs      # SPHINCS+ verifier (backup)
│   └── shake256.rs     # SHAKE256 hash function
└── Cargo.toml
```

**Contract Address (Testnet):**
```
CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW
```

#### Key Functions

**Registration**: Before using the wallet, users register their SPHINCS+ public key with the contract. This creates an on-chain binding between their Stellar address and quantum-safe identity.

```rust
pub fn register(env: Env, stellar_address: Address, sphincs_public_key: Bytes)
```

**ZK Verification**: The core security function. It verifies a Groth16 proof and, if valid, records an approval for the transaction.

```rust
pub fn verify_zk_and_authorize(
    env: Env,
    stellar_address: Address,
    tx_hash: BytesN<32>,
    tx_xdr: Bytes,
    proof_bytes: Bytes,         // 192 bytes
    public_inputs_bytes: Bytes, // 96 bytes
) -> u64  // Returns approval nonce
```

**Authorization Preimage**: When Stellar checks if the contract authorizes a transaction, this function provides the necessary preimage.

```rust
pub fn get_authorization_preimage(env: Env, tx_hash: BytesN<32>) -> Option<Bytes>
```

#### Groth16 Verifier

The contract includes a full implementation of Groth16 proof verification using BLS12-381 elliptic curve pairings. The verification equation is:

```
e(π_A, π_B) = e(α, β) · e(L, γ) · e(π_C, δ)
```

Where:
- `e` is the bilinear pairing function
- `π_A, π_B, π_C` are the proof elements (192 bytes total)
- `α, β, γ, δ` are from the verification key (set during trusted setup)
- `L` is computed from the public inputs (transaction hash, public key)

This equation can only be satisfied if the prover knew a valid SPHINCS+ signature—the zero-knowledge property means we verify this without seeing the actual signature.

---

### 3.4 ZK Circuits

**Location:** `zk-circuits/`

The ZK circuits define what we're proving. Written in Circom, they specify the computation that the prover must execute correctly to generate a valid proof. In our case: "I know a SPHINCS+ signature that validates against this public key and transaction hash."

#### Why ZK Proofs?

SPHINCS+ signatures are ~17KB—too large for efficient on-chain verification. ZK proofs let us compress verification: instead of checking the full signature on-chain, we:

1. Verify the signature off-chain (in the relayer)
2. Generate a proof that we did the verification correctly
3. Verify the small proof (192 bytes) on-chain

The proof is constant-size regardless of the computation's complexity. Our circuit has ~47 million constraints, but the proof is still just 192 bytes.

#### Circuit Architecture

```
zk-circuits/
├── circuits/
│   ├── sphincs_main.circom     # Main verification circuit
│   ├── sphincs_fors.circom     # FORS tree verification
│   ├── keccak.circom           # SHAKE256 implementation
│   └── utils.circom            # Helper functions
├── scripts/
│   ├── compile.sh              # Compile circuits
│   ├── setup.sh                # Trusted setup
│   └── prove.js                # Generate proofs
└── build/                      # Compiled artifacts
```

#### What the Circuit Proves

The main circuit (`sphincs_main.circom`) proves knowledge of a valid SPHINCS+ signature. It has:

**Public Inputs** (visible to verifier):
- `messageHash[32]`: The transaction hash being signed
- `pkSeed[16]`: First half of the SPHINCS+ public key
- `pkRoot[16]`: Second half (the hypertree root)

**Private Inputs** (hidden from verifier):
- `sigR[16]`: Signature randomness
- `forsSecrets[30][16]`: FORS tree secrets
- `forsAuthPaths[30][9][16]`: Authentication paths
- `htSigCommitment[32]`: Commitment to hypertree signature

The circuit verifies that the private inputs constitute a valid SPHINCS+ signature for the given public inputs. If the proof verifies, we know the prover had a valid signature—without ever seeing it.

#### Constraint Count

| Component | Constraints |
|-----------|-------------|
| Message Digest (SHAKE256) | ~155,000 |
| FORS Verification (30 trees) | ~46,500,000 |
| Hypertree Commitment | ~155,000 |
| **Total** | **~46,810,000** |

The large constraint count comes from implementing SHAKE256 in a ZK circuit—each hash requires thousands of constraints. Fortunately, this only affects proof generation time, not verification.

---

### 3.5 Demo Site

**Location:** `demo-site/`

The demo site is a Next.js application that showcases wallet functionality and provides a visual agent builder for automated trading strategies.

#### Tech Stack

- **Framework:** Next.js 14 with App Router
- **UI:** React 18, Tailwind CSS, Radix UI components
- **Flow Editor:** ReactFlow for visual programming
- **Charts:** Lightweight Charts for market data

#### Key Features

**X402 Micropayments**: Integration with the X402 payment protocol, allowing websites to charge small amounts for API access or content.

**Agent Builder**: A visual programming interface where users can create automated trading agents by connecting blocks. Blocks include price monitors, swap executors, and condition evaluators.

---

## 4. Cryptographic Foundations

### 4.1 SPHINCS+ (NIST FIPS 205)

SPHINCS+ is a hash-based signature scheme standardized by NIST in their post-quantum cryptography competition. Unlike lattice-based alternatives (like Dilithium), SPHINCS+ relies only on the security of hash functions—a conservative choice that's well-understood.

#### How It Works

SPHINCS+ uses a "hypertree" structure—a tree of trees. At the leaves are one-time signatures (WOTS+), organized into FORS trees, which feed into a main Merkle tree. The signature includes:

1. **Randomness (R)**: 16 bytes of randomness for message hashing
2. **FORS Signature**: Reveals secrets from 30 different trees based on the message digest
3. **Hypertree Signature**: A chain of WOTS+ signatures and authentication paths through 20 layers

```
SPHINCS+ Signature Structure (~17KB):
├── R (16 bytes)              # Randomness
├── FORS Signature (4,800 bytes)
│   └── 30 trees × (secret + 9 auth nodes) × 16 bytes
└── Hypertree Signature (~12,000 bytes)
    └── 20 layers × (WOTS+ signature + authentication path)
```

#### Security Level

Our configuration provides 128-bit post-quantum security (NIST Level 1). This means:
- Classical computers: Would need 2^128 operations to forge a signature
- Quantum computers: Would need 2^64 operations (Grover's algorithm halves the security level for symmetric primitives)

Both are computationally infeasible for the foreseeable future.

### 4.2 SHAKE256

SHAKE256 is an "extendable-output function" (XOF) based on the Keccak permutation (the same primitive underlying SHA-3). Unlike fixed-output hash functions, SHAKE256 can produce any length of output.

SPHINCS+ uses SHAKE256 extensively:
- **F()**: Compute tree leaves from secrets
- **H()**: Combine tree nodes
- **T_l()**: Compress public keys
- **H_msg()**: Hash messages into tree indices

We implement SHAKE256 both in TypeScript (for the extension), Rust (for the contract), and Circom (for ZK proofs).

### 4.3 Groth16 ZK-SNARKs

Groth16 is a zero-knowledge proof system with the smallest proof size among practical SNARKs. A proof is always exactly 192 bytes, regardless of what's being proven.

#### The Verification Equation

```
e(π_A, π_B) = e(α, β) · e(L, γ) · e(π_C, δ)
```

This equation uses "bilinear pairings" on the BLS12-381 elliptic curve. The pairing function `e` has a special property: `e(aG, bH) = e(G, H)^(ab)`. This enables checking complex relationships between curve points.

#### Trusted Setup

Groth16 requires a "trusted setup" ceremony to generate the proving and verification keys. The setup produces toxic waste that, if known, would allow forging proofs. Our system uses keys from the Hermez ceremony, which had over 100 participants—only one needed to be honest for the system to be secure.

---

## 5. Transaction Flows

### 5.1 Account Setup (One-Time)

Before using quantum-safe transactions, users must set up their account. This is a one-time process:

**Step 1: Create Wallet**
The extension generates two keypairs: a standard Stellar Ed25519 pair (for initial account creation) and a SPHINCS+ pair (for quantum-safe signing).

**Step 2: Fund Account**
On testnet, users can get free XLM from Friendbot. On mainnet, they'd need to acquire XLM through an exchange.

**Step 3: Register with Contract**
The user's SPHINCS+ public key is registered with our smart contract. This creates an on-chain record linking their Stellar address to their quantum-safe identity.

**Step 4: Lock Account**
This is the critical step. The extension submits a transaction that:
- Sets `masterWeight = 0` (the Ed25519 key can no longer sign)
- Adds the contract as a signer with weight 1
- Sets all thresholds to 1

After this transaction, the account is "locked"—only the contract can authorize transactions, and the contract only authorizes transactions with valid SPHINCS+ proofs.

### 5.2 Sending a Payment

Once locked, here's how a payment works:

**Step 1: Build Transaction**
User enters recipient and amount. The extension builds a standard Stellar payment transaction but includes the SPHINCS+ public key hash in the memo field.

**Step 2: Sign with SPHINCS+**
The extension signs the transaction hash with the user's SPHINCS+ private key, producing a ~17KB signature. This happens locally—the private key never leaves the browser.

**Step 3: Send to Relayer**
The extension sends the transaction XDR and signature to the relayer. The relayer verifies the signature is valid.

**Step 4: Generate ZK Proof (Optional)**
For maximum security, the relayer generates a ZK proof. This takes 30-120 seconds but creates cryptographic certainty.

**Step 5: Contract Authorization**
The relayer submits the proof to the smart contract. The contract verifies it and records an approval for this specific transaction.

**Step 6: Submit Transaction**
The relayer submits the actual payment transaction to Stellar. Since the contract has approved it, Stellar accepts the transaction.

**Step 7: Confirmation**
The extension polls for confirmation and shows the user the result, including a link to view the transaction on Stellar Expert.

---

## 6. Security Model

### 6.1 What We Protect Against

| Threat | How We Mitigate |
|--------|-----------------|
| **Quantum attacks on Ed25519** | Ed25519 is disabled (masterWeight=0). Even if broken, it can't sign. |
| **Relayer compromise** | Relayer can't forge SPHINCS+ signatures. It can only verify and relay. |
| **Contract vulnerability** | Contract has no private key. Even if exploited, there's nothing to steal. |
| **Replay attacks** | Each approval has a unique nonce and 5-minute expiration. |
| **Signature forgery** | SPHINCS+ provides 128-bit post-quantum security. |

### 6.2 Trust Assumptions

Our security relies on several assumptions:

1. **Hash Function Security**: SHAKE256 (Keccak) remains secure against quantum computers. This is widely believed—hash functions are only weakened (not broken) by Grover's algorithm.

2. **Trusted Setup Integrity**: At least one participant in the Hermez ceremony destroyed their toxic waste. Given 100+ participants, this is highly likely.

3. **Soroban Platform Security**: The Stellar network and Soroban smart contract platform are secure. This is the same assumption all Stellar users make.

4. **Implementation Correctness**: Our SPHINCS+ and Groth16 implementations are correct. We follow the specifications closely and include test vectors.

### 6.3 What We Don't Protect Against

- **User device compromise**: If malware steals your SPHINCS+ private key, game over.
- **Social engineering**: If you're tricked into signing a malicious transaction, we can't help.
- **Relayer unavailability**: If the relayer is down, you can't transact (but funds remain safe).

---

## 7. Data Structures

### 7.1 Wallet Storage (Extension)

The extension stores wallet data in Chrome's local storage:

```typescript
interface WalletData {
  id: string;                    // Unique identifier
  name: string;                  // User-friendly name
  stellarPublicKey: string;      // Stellar address (G...)
  stellarSecretKey: string;      // Stellar secret (S...)
  sphincsPublicKey: string;      // Base64-encoded, 32 bytes
  sphincsSecretKey: string;      // Base64-encoded, 64 bytes
  isLocked: boolean;             // True if quantum-safe mode active
  createdAt: number;             // Unix timestamp
}
```

### 7.2 Contract Storage

The contract maintains several data structures:

```rust
// Links Stellar addresses to SPHINCS+ public keys
struct Registration {
    sphincs_pk: Bytes,        // 32 bytes
    registered_at: u64,       // Timestamp
}

// Tracks approved transactions awaiting execution
struct PendingApproval {
    tx_hash: BytesN<32>,      // Transaction hash
    tx_xdr: Bytes,            // Serialized transaction
    stellar_address: Address,  // Who approved it
    approved_at: u64,         // When approved
    expires_at: u64,          // Approval expiration (5 min)
    consumed: bool,           // Already used?
}

// Groth16 verification key (set during ZK initialization)
struct VerificationKey {
    alpha_g1: BytesN<48>,     // α point in G1
    beta_g2: BytesN<96>,      // β point in G2
    gamma_g2: BytesN<96>,     // γ point in G2
    delta_g2: BytesN<96>,     // δ point in G2
    ic: Vec<BytesN<48>>,      // Input commitment points
}
```

---

## 8. API Reference

### 8.1 Extension Messages

The extension uses Chrome's message passing. Key messages:

**Create Wallet**
```typescript
chrome.runtime.sendMessage({ type: 'CREATE_WALLET' })
// Response: { success: true, wallet: WalletData }
```

**Send Payment**
```typescript
chrome.runtime.sendMessage({
  type: 'SEND_XLM',
  payload: { to: 'GDEST...', amount: '10' }
})
// Response: { success: true, txHash: '...', stellarExpertUrl: '...' }
```

**Lock Wallet**
```typescript
chrome.runtime.sendMessage({ type: 'LOCK_WALLET' })
// Response: { success: true }
// After this, account is quantum-safe
```

### 8.2 Relayer Endpoints

**Health Check**
```
GET /api/health
→ { status: 'ok', relayerPublicKey: '...', zkEnabled: true }
```

**Verify and Submit**
```
POST /api/verify-and-submit
Body: { stellarAddress, txHash, txXdr, sphincsSignature }
→ { success: true, paymentTxHash: '...' }
```

**Generate ZK Proof**
```
POST /api/zk/generate-proof
Body: { stellarAddress, txHash, sphincsPublicKey, sphincsSignature }
→ { success: true, proofHex: '...', publicInputsHex: '...', provingTimeSeconds: 45.2 }
```

---

## 9. Deployment

### 9.1 Smart Contract

```bash
cd soroban-verifier
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy --wasm target/.../quantum_verifier.wasm --network testnet
```

### 9.2 Relayer

```bash
cd relayer
npm install
export RELAYER_SECRET=SXXX...
export CONTRACT_ID=CAQNMNI...
npm run dev  # Development
vercel deploy  # Production
```

### 9.3 Extension

```bash
cd extension
npm install
npm run build
# Load extension/dist as unpacked extension in Chrome
```

### 9.4 ZK Circuits

```bash
cd zk-circuits
npm install
./scripts/compile.sh sphincs_main
./scripts/setup.sh  # Requires ~16GB RAM, takes 10-30 minutes
```

---

## Appendix: Performance Metrics

| Operation | Duration | Output Size |
|-----------|----------|-------------|
| Key Generation | <100ms | 32B pk, 64B sk |
| SPHINCS+ Signing | <500ms | ~17KB |
| ZK Proof Generation | 30-120s | 192B |
| On-chain ZK Verification | <1s | - |
| Full Transaction | 35-130s | - |

---

## Appendix: External Resources

- [Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW)
- [SPHINCS+ Specification (NIST FIPS 205)](https://csrc.nist.gov/pubs/fips/205/final)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [Hermez Trusted Setup](https://hermez.io/trusted-setup)

---

*Last Updated: 2026-02-03*
