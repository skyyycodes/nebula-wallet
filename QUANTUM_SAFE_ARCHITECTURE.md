# Quantum-Safe Architecture

## Overview

This wallet uses a **ZK-SNARK based authorization system** to achieve true quantum safety. The key insight is that the **Soroban contract becomes the signer** on the wallet, not an Ed25519 key.

## Security Model

### Traditional (Quantum-Vulnerable) Flow
```
User → Ed25519 Sign → Stellar Network
         ↑
    QUANTUM VULNERABLE
    (Shor's algorithm can break)
```

### Our Quantum-Safe Flow
```
                                   ┌─────────────────────────┐
                                   │   Soroban Contract      │
                                   │   (No private key!)     │
                                   │                         │
User → SPHINCS+ Sign → ZK Prove → │ Verify ZK Proof        │ → Stellar
                                   │ Authorize Transaction   │
                                   └─────────────────────────┘
                                            ↑
                                   CONTRACT IS THE SIGNER
                                   (Nothing to steal!)
```

## How It Works

### Step 1: Wallet Locking (One-time setup)

When the user "locks" their wallet for quantum protection:

1. **Add contract as signer**: The Soroban contract's hash is added as a `sha256Hash` signer with weight 1
2. **Disable Ed25519**: Set `masterWeight = 0` (Ed25519 key can NEVER sign again)
3. **Set thresholds**: All thresholds set to 1

```typescript
// In stellar.ts
StellarSdk.Operation.setOptions({
  signer: {
    sha256Hash: contractHash,  // Contract becomes the signer!
    weight: 1
  }
});
StellarSdk.Operation.setOptions({
  masterWeight: 0,  // Ed25519 disabled forever
  lowThreshold: 1,
  medThreshold: 1,
  highThreshold: 1
});
```

### Step 2: Transaction Signing

When the user wants to send a transaction:

1. **Build transaction**: Create the Stellar transaction (payment, swap, etc.)
2. **SPHINCS+ signature**: User signs `tx_hash` with their SPHINCS+ private key
3. **Generate ZK proof**: Relayer generates a ZK-SNARK proof that proves the SPHINCS+ signature is valid

### Step 3: Contract Verification & Authorization

1. **Submit ZK proof**: Call `verify_zk_and_authorize()` on the contract
2. **Contract verifies**: Contract uses Groth16 verifier with BLS12-381 pairing
3. **Store approval**: If valid, contract stores the approval
4. **Get authorization**: Contract provides its authorization preimage

### Step 4: Transaction Execution

1. **Build final transaction**: Rebuild with current sequence number
2. **Add contract authorization**: Include contract's preimage as signature
3. **Submit to Stellar**: Transaction executes with contract's authority

## Why This Is Quantum-Safe

| Component | Quantum Status | Reason |
|-----------|---------------|--------|
| User's Ed25519 | ✅ SAFE | Disabled (masterWeight=0) |
| Relayer's Ed25519 | ✅ SAFE | Only pays gas, no signing authority |
| Contract | ✅ SAFE | Has no private key to steal |
| SPHINCS+ | ✅ SAFE | Hash-based, quantum-resistant |
| ZK Proof | ✅ SAFE | Based on hash functions |

## The Key Insight

**The contract IS the signer, not the relayer's Ed25519 key.**

- In the old model: Relayer's Ed25519 key had signing authority → Quantum vulnerable
- In the new model: Contract has signing authority → No private key exists to compromise

Even if a quantum computer could break Ed25519:
- User's Ed25519: Disabled, can't sign
- Relayer's Ed25519: Only pays gas, can't authorize
- To steal funds: Would need valid SPHINCS+ signature, which is quantum-safe

## Code Locations

| File | Purpose |
|------|---------|
| [extension/src/stellar.ts](extension/src/stellar.ts) | `buildLockAccountTransaction()` - Adds contract as signer |
| [soroban-verifier/src/lib.rs](soroban-verifier/src/lib.rs) | `verify_zk_and_authorize()` - Verifies ZK proof |
| [soroban-verifier/src/groth16.rs](soroban-verifier/src/groth16.rs) | Groth16 verifier with BLS12-381 |
| [relayer/src/api.ts](relayer/src/api.ts) | `/api/zk/submit` - Submits ZK proof to contract |
| [relayer/src/zk-prover.ts](relayer/src/zk-prover.ts) | `generateZKProof()` - Server-side proof generation |
| [zk-circuits/](zk-circuits/) | Circom circuits for SPHINCS+ verification |

## Transaction Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           USER'S BROWSER                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User initiates payment                                               │
│     └─→ Build transaction → Get tx_hash                                  │
│                                                                          │
│  2. Sign with SPHINCS+                                                   │
│     └─→ sphincs_signature = SPHINCS+.sign(tx_hash, sphincs_sk)          │
│                                                                          │
│  3. Send to relayer                                                      │
│     └─→ POST /api/zk/generate-proof { tx_hash, signature, public_key }  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              RELAYER                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  4. Generate ZK proof (30-120 seconds)                                   │
│     └─→ proof = snarkjs.groth16.fullProve(signature, wasm, zkey)        │
│                                                                          │
│  5. Submit to contract                                                   │
│     └─→ contract.verify_zk_and_authorize(tx_hash, proof)                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          SOROBAN CONTRACT                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  6. Verify ZK proof                                                      │
│     └─→ Groth16 pairing check with BLS12-381                            │
│                                                                          │
│  7. Store approval                                                       │
│     └─→ PendingApproval { tx_hash, approved_at, expires_at }            │
│                                                                          │
│  8. Provide authorization                                                │
│     └─→ Contract's preimage for sha256Hash signer                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          STELLAR NETWORK                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  9. Transaction executes                                                 │
│     └─→ Contract is authorized signer                                   │
│     └─→ Payment/swap completes                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Summary

**Your understanding is correct:**

1. ✅ Register/lock sets `masterWeight=0`, `signerWeight=1`
2. ✅ The **CONTRACT** is the signer (not relayer's Ed25519)
3. ✅ SPHINCS+ signs the transaction hash
4. ✅ Relayer generates/verifies ZK proof
5. ✅ ZK proof goes to Soroban contract
6. ✅ Contract authorizes (because it IS the signer)

This achieves TRUE quantum safety because no Ed25519 private key has authority over the wallet.
