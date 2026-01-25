

# Quantum Stellar Wallet

A quantum-safe Stellar wallet Chrome extension using SPHINCS+ post-quantum signatures, ZK-SNARKs, and contract-based authorization. Built for the Stellar Build-A-Thon Kolkata Edition.

---

## Project Description

**Quantum Stellar Wallet** is a next-generation Stellar wallet that achieves true quantum resistance. It leverages SPHINCS+ (NIST-approved post-quantum signature scheme), ZK-SNARKs for privacy and proof, and a Soroban smart contract as the only authorized signer. Even if quantum computers break Ed25519, funds remain secure.
<img width="553" height="507" alt="image" src="https://github.com/user-attachments/assets/b471de82-789c-48f0-b9fe-7b656665c3e0" />

---

## Contract Address

- **Soroban Contract Address:**  
  `CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW`  
  [View on Stellar.expert](https://stellar.expert/explorer/testnet/contract/CAQNMNI57UZ44RV7K2T4INETCEES4W77XB3CT22Y2G6SH3SFFLPULDQW)

---

## Problem Statement

**Problem:**  
Stellar wallets today rely on Ed25519 signatures, which are vulnerable to quantum attacks (Shor’s algorithm). Once quantum computers are practical, all existing wallets could be drained.

**Solution:**  
This project demonstrates a wallet where:
- The Ed25519 key is permanently disabled (`masterWeight=0`)
- Only a Soroban contract (with no private key) can authorize transactions
- User signs with SPHINCS+ (post-quantum) and proves validity via ZK-SNARKs

---

## Features

- **Quantum-Safe Wallet Creation:** SPHINCS+ keypair generation, contract registration
- **Account Locking:** Disables Ed25519, adds contract as signer
- **Quantum-Safe Payments:** All transactions require SPHINCS+ signature and ZK proof
- **Non-custodial:** No private key on backend or contract
- **Demo Website:** Connect, view balance, send XLM
- **Verifier Backend:** Verifies ZK proof, submits transactions
- **Full Test Suite:** End-to-end quantum-safe flow

---
<img width="1076" height="501" alt="image" src="https://github.com/user-attachments/assets/7cabdb81-160e-4482-95ea-6b8275e9cfcc" />

## Architecture Overview

```
User (Browser Extension)
   │
   ├─ SPHINCS+ Sign → ZK Proof
   │
Verifier (Relayer Service)
   │
   ├─ Verifies ZK Proof
   │
Soroban Contract (Testnet)
   │
   ├─ Authorizes Transaction (no private key)
   │
Stellar Network
```

- **Extension:** TypeScript, Manifest V3, Webpack
- **Crypto:** SPHINCS+-SHAKE-256f-simple, ZK-SNARKs (Groth16, BLS12-381)
- **Backend:** Node.js, Express
- **Smart Contract:** Rust (Soroban)
- **Demo Site:** Next.js, React

---

## Screenshots

*(Add screenshots of your extension, demo site, and contract explorer here)*

---

## Deployed Link

- **Demo Website:**  
  *(Add your deployed link if available, or instructions to run locally)*

---

## Future Scope and Plans

- Complete ZK circuit optimization for practical proving time
- Integrate WASM-based SPHINCS+ for production
- Add real-time event monitoring and error handling
- Security audits and production deployment
- Support for multiple accounts and assets

---

## Demo Video

*(Add your demo video link here, max 5 minutes, showing product flow and functionality)*

---

## How to Run

See detailed instructions in the README above, or:

1. **Build and load the extension** (`extension/`)
2. **Start the verifier backend** (`relayer/`)
3. **Serve the demo website** (`demo-site/`)
4. **Follow the test guide** (`EXTENSION_TEST_GUIDE.md`)

---

## License

MIT License - Hackathon Demo

---

**Disclaimer:**  
This is a hackathon demo for educational purposes. Do not use with real funds. The SPHINCS+ and ZK implementations are simplified for demonstration.

---

Let us know if you need help or want to contribute!

