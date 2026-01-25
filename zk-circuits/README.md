# SPHINCS+ ZK-SNARK Circuits

This directory contains Circom circuits for generating ZK proofs of SPHINCS+ signature validity.

## Why ZK-SNARKs?

The original Nebula architecture had a critical vulnerability:
- User keys are quantum-safe (SPHINCS+)
- But the relayer uses an Ed25519 key to sign transactions
- Ed25519 is vulnerable to quantum attacks (Shor's algorithm)

**Solution**: Use ZK-SNARKs to prove SPHINCS+ signature validity on-chain, eliminating the need for any Ed25519 signing in the trust path.

## Architecture

```
OLD (Quantum Vulnerable):
User → SPHINCS+ Sign → Relayer (Ed25519) → Stellar
                            ↑
                    QUANTUM VULNERABLE

NEW (Quantum Safe):
User → SPHINCS+ Sign → ZK Proof → Contract (ZK Verify) → Stellar
                                        ↑
                               NO ED25519 KEY
```

## Setup

### Prerequisites

1. Install Circom:
```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
git clone https://github.com/iden3/circom.git
cd circom && cargo build --release
sudo cp target/release/circom /usr/local/bin/
```

2. Install dependencies:
```bash
cd zk-circuits
npm install
```

### Compile Circuit

```bash
npm run compile
# or
./scripts/compile.sh
```

### Trusted Setup

```bash
npm run setup
# or
./scripts/setup.sh
```

This will:
1. Download Powers of Tau from Hermez ceremony
2. Generate proving key (zkey)
3. Export verification key for Soroban contract

### Test Proof Generation

```bash
npm run prove
# or
node scripts/prove.js
```

## Circuit Structure

```
circuits/
├── utils.circom          # Utility functions and constants
├── keccak.circom         # Keccak-f[1600] permutation (for SHAKE256)
├── sphincs_fors.circom   # FORS tree verification
└── sphincs_main.circom   # Main verification circuit
```

### Public Inputs
- `messageHash[32]`: Transaction hash being signed
- `pkSeed[16]`: SPHINCS+ public key seed
- `pkRoot[16]`: SPHINCS+ public key root

### Private Inputs
- `sigR[16]`: Signature randomness
- `forsSecrets[30][16]`: FORS secret values
- `forsAuthPaths[30][9][16]`: FORS authentication paths
- `forsPkHint[16]`: Computed FORS public key
- `htSigCommitment[32]`: Hypertree signature commitment

## Deployment

After setup, copy assets to relayer:

```bash
mkdir -p ../relayer/zk-assets
cp build/sphincs_main_js/sphincs_main.wasm ../relayer/zk-assets/
cp build/sphincs_main_final.zkey ../relayer/zk-assets/
cp build/verification_key.json ../relayer/zk-assets/
```

## API Usage

### Generate ZK Proof

```bash
curl -X POST http://localhost:3001/api/zk/generate-proof \
  -H "Content-Type: application/json" \
  -d '{
    "stellarAddress": "GXXX...",
    "txHash": "abc123...",
    "sphincsPublicKey": "def456...",
    "sphincsSignature": "base64..."
  }'
```

### Submit ZK Proof

```bash
curl -X POST http://localhost:3001/api/zk/submit \
  -H "Content-Type: application/json" \
  -d '{
    "stellarAddress": "GXXX...",
    "txHash": "abc123...",
    "txXdr": "base64...",
    "proofHex": "...",
    "publicInputsHex": "..."
  }'
```

## Constraint Estimates

| Component | Constraints |
|-----------|-------------|
| SHAKE256 hash | ~150,000 |
| FORS tree (1) | ~1,500,000 |
| Full FORS (30 trees) | ~45,000,000 |
| Total circuit | ~50,000,000+ |

Note: Full SPHINCS+ verification in ZK is expensive. This implementation optimizes by:
1. Proving FORS portion (critical cryptographic path)
2. Using commitment for hypertree (reduces constraints)
3. Server-side proving (faster than browser)

## Security Notes

- The trusted setup uses Hermez Powers of Tau (production-ready)
- ZK proofs are ~384 bytes (vs ~17KB SPHINCS+ signature)
- Verification on Soroban uses BLS12-381 host functions
- No Ed25519 key is involved in the authorization path
