# Quantum Stellar Wallet

A quantum-safe Stellar wallet Chrome extension using SPHINCS+ post-quantum signatures and Stellar preAuthTx.

## Overview

This project demonstrates a quantum-resistant approach to Stellar wallet security. Even if quantum computers break Ed25519, funds in this wallet remain secure.

### Security Model

1. **SPHINCS+ Signatures**: All transaction authorizations use SPHINCS+-SHAKE-256f-simple, a NIST-approved post-quantum signature scheme
2. **Locked Accounts**: Stellar accounts are locked with `masterWeight=0`, meaning the Ed25519 private key can NEVER authorize transactions
3. **PreAuthTx Only**: Only pre-authorized transactions (verified via SPHINCS+) can move funds
4. **Non-Custodial Verifier**: The verifier never has access to keys that can drain funds

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Wallet Extension                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ SPHINCS+    │  │ Stellar SDK │  │ Secure Storage          │  │
│  │ (Pure JS)   │  │             │  │ (Chrome storage.local)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Demo Website                                │
├─────────────────────────────────────────────────────────────────┤
│  window.quantumStellar.connect()                                │
│  window.quantumStellar.getBalance()                             │
│  window.quantumStellar.sendXLM(to, amount)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Verifier Backend                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Verify SPHINCS+ signature                                   │
│  2. Add preAuthTx signer                                        │
│  3. Submit transaction to Stellar Testnet                       │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
nebula-ext/
├── extension/           # Chrome wallet extension
│   ├── src/
│   │   ├── background.ts    # Service worker
│   │   ├── content.ts       # Content script (bridge)
│   │   ├── injected.ts      # Injected API (window.quantumStellar)
│   │   ├── popup.ts         # Popup UI logic
│   │   ├── sphincs.ts       # SPHINCS+ implementation
│   │   ├── stellar.ts       # Stellar SDK wrapper
│   │   ├── storage.ts       # Secure storage
│   │   └── types.ts         # TypeScript types
│   ├── public/
│   │   ├── manifest.json    # Extension manifest
│   │   ├── popup.html       # Popup UI
│   │   └── icons/           # Extension icons
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── demo-site/           # Demo website
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── verifier/            # Verification backend
│   ├── index.js
│   └── package.json
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Chrome browser

### 1. Build the Extension

```bash
cd extension
npm install
npm run build
```

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder

### 3. Start the Verifier Backend

```bash
cd verifier
npm install
npm start
```

The verifier runs on `http://localhost:3001`

### 4. Serve the Demo Website

```bash
cd demo-site
# Using Python
python -m http.server 8080
# Or using Node
npx serve -p 8080
```

Open `http://localhost:8080` in Chrome.

## Demo Flow

### 1. Create Wallet

1. Click the extension icon to open the popup
2. Click "Create Quantum Wallet"
3. A new Stellar keypair + SPHINCS+ keypair are generated

### 2. Fund Wallet

1. Click "Airdrop Testnet XLM"
2. Friendbot will send 10,000 XLM to your testnet account

### 3. Lock Wallet (Quantum Secure)

1. Click "Lock Wallet (Quantum Secure)"
2. This sets `masterWeight=0` on the Stellar account
3. **IMPORTANT**: After this, the Ed25519 key can NEVER sign transactions
4. Only SPHINCS+ verified preAuthTx can move funds

### 4. Send XLM (Demo Website)

1. Open the demo website (`http://localhost:8080`)
2. Click "Connect Quantum Wallet"
3. Enter destination address and amount
4. Click "Send XLM"

### Transaction Flow

```
1. Demo website calls sendXLM()
         │
         ▼
2. Wallet builds Stellar transaction locally
   - Adds timebounds (5 min validity)
   - Computes transaction hash
         │
         ▼
3. Wallet signs hash with SPHINCS+
         │
         ▼
4. Wallet sends to verifier:
   {
     tx_xdr: "...",
     tx_hash: "...",
     sphincs_sig: "...",
     sphincs_pub: "..."
   }
         │
         ▼
5. Verifier verifies SPHINCS+ signature
         │
         ▼
6. Verifier adds preAuthTx and submits
         │
         ▼
7. Transaction confirmed on Stellar Testnet
```

## API Reference

### Website API (window.quantumStellar)

```typescript
interface QuantumStellarAPI {
  // Connect to wallet, returns address
  connect(): Promise<{ address: string }>;

  // Get current XLM balance
  getBalance(): Promise<string>;

  // Send XLM to destination
  sendXLM(to: string, amount: string): Promise<{ txHash: string }>;
}
```

### Verifier Endpoints

```
POST /register
  Register SPHINCS+ public key for an account
  Body: { stellar_address, sphincs_pub }

POST /verify-and-submit
  Verify SPHINCS+ signature and submit transaction
  Body: { tx_xdr, tx_hash, sphincs_sig, sphincs_pub, source_address }

GET /health
  Health check
```

## Security Considerations

### Why is this Quantum-Safe?

1. **Ed25519 Cannot Spend**: The account's `masterWeight=0` means the Ed25519 private key has zero signing weight. Even if quantum computers can derive the private key from the public key, they cannot authorize transactions.

2. **SPHINCS+ is Post-Quantum**: SPHINCS+ is a hash-based signature scheme that is believed to be secure against quantum computers. It's one of the NIST-selected post-quantum algorithms.

3. **PreAuthTx is Commitment**: The preAuthTx mechanism commits to a specific transaction before it's authorized. The verifier only adds the preAuthTx signer AFTER verifying the SPHINCS+ signature.

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Quantum computer breaks Ed25519 | masterWeight=0, cannot sign |
| Verifier compromise | Verifier cannot drain funds (no signing keys) |
| Transaction interception | Timebounds limit validity window |
| Key theft from browser | Keys in extension storage, not exposed to websites |

### Limitations (Demo)

1. **SPHINCS+ Implementation**: Uses pure JavaScript implementation for demo. Production should use liboqs WASM build.
2. **Verifier Authorization**: Full preAuthTx flow requires verifier to be a signer on locked accounts. Demo shows verification passing.
3. **Single Account**: Demo supports single wallet per browser profile.

## Technology Stack

- **Extension**: TypeScript, Chrome Manifest V3, Webpack
- **Crypto**: SPHINCS+-SHAKE-256f-simple (NIST Level 5)
- **Blockchain**: Stellar SDK, Testnet
- **Backend**: Node.js, Express
- **Website**: Vanilla JavaScript

## Development

### Extension Development

```bash
cd extension
npm run dev  # Watch mode
```

### Testing SPHINCS+ Signatures

```javascript
import { getSphincsModule } from './sphincs';

const sphincs = await getSphincsModule();
const { publicKey, secretKey } = await sphincs.generateKeyPair();

const message = new TextEncoder().encode('Hello, Quantum World!');
const signature = await sphincs.sign(message, secretKey);
const valid = await sphincs.verify(signature, message, publicKey);
console.log('Signature valid:', valid);
```

## Resources

- [SPHINCS+ Specification](https://sphincs.org/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar PreAuthTx](https://developers.stellar.org/docs/encyclopedia/signatures-multisig#pre-authorized-transaction)
- [NIST Post-Quantum Standards](https://csrc.nist.gov/Projects/post-quantum-cryptography)

## License

MIT License - Hackathon Demo

---

**Disclaimer**: This is a hackathon demo for educational purposes. Do not use with real funds. The SPHINCS+ implementation is simplified for demonstration - production use requires verified cryptographic libraries.
