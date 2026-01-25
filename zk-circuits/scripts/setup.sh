#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$ROOT_DIR/build"
PTAU_DIR="$ROOT_DIR/ptau"

echo "=== SPHINCS+ ZK Trusted Setup ==="

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$PTAU_DIR"

# Check for snarkjs
if ! command -v snarkjs &> /dev/null; then
    echo "Installing snarkjs globally..."
    npm install -g snarkjs
fi

# Check if circuit is compiled
if [ ! -f "$BUILD_DIR/sphincs_main.r1cs" ]; then
    echo "Error: Circuit not compiled. Run ./scripts/compile.sh first"
    exit 1
fi

# Get circuit size to determine ptau file needed
echo ""
echo "Step 1: Analyzing circuit..."
echo "----------------------------------------"
CONSTRAINTS=$(snarkjs r1cs info "$BUILD_DIR/sphincs_main.r1cs" 2>&1 | grep "Constraints" | awk '{print $2}')
echo "Circuit has $CONSTRAINTS constraints"

# Calculate required ptau power (2^n >= constraints)
POWER=10
while [ $((2**POWER)) -lt "$CONSTRAINTS" ]; do
    POWER=$((POWER + 1))
done
echo "Requires ptau with 2^$POWER = $((2**POWER)) points"

# Download Powers of Tau from Hermez ceremony
PTAU_FILE="$PTAU_DIR/powersOfTau28_hez_final_$POWER.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo ""
    echo "Step 2: Downloading Powers of Tau (2^$POWER)..."
    echo "----------------------------------------"
    echo "Using Hermez trusted setup ceremony (production-ready)"

    # Hermez ceremony files are available up to 2^28
    if [ "$POWER" -gt 28 ]; then
        echo "Warning: Circuit too large for available ptau files"
        echo "Using ptau 28 (max available)"
        POWER=28
        PTAU_FILE="$PTAU_DIR/powersOfTau28_hez_final_28.ptau"
    fi

    PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_$POWER.ptau"
    echo "Downloading from: $PTAU_URL"
    curl -L -o "$PTAU_FILE" "$PTAU_URL"
    echo "Downloaded: $(ls -lh "$PTAU_FILE" | awk '{print $5}')"
else
    echo ""
    echo "Step 2: Powers of Tau already downloaded"
    echo "----------------------------------------"
    echo "Using: $PTAU_FILE"
fi

echo ""
echo "Step 3: Generating proving key (zkey)..."
echo "----------------------------------------"
echo "This may take several minutes for large circuits..."

# Phase 2: Circuit-specific setup
ZKEY_INIT="$BUILD_DIR/sphincs_main_0000.zkey"
ZKEY_FINAL="$BUILD_DIR/sphincs_main_final.zkey"

snarkjs groth16 setup "$BUILD_DIR/sphincs_main.r1cs" "$PTAU_FILE" "$ZKEY_INIT"

echo ""
echo "Step 4: Contributing to phase 2..."
echo "----------------------------------------"
# Add a contribution (in production, multiple parties would contribute)
echo "Adding entropy contribution..."
snarkjs zkey contribute "$ZKEY_INIT" "$ZKEY_FINAL" --name="nebula-contribution" -v -e="$(head -c 64 /dev/urandom | xxd -p)"

echo ""
echo "Step 5: Exporting verification key..."
echo "----------------------------------------"
snarkjs zkey export verificationkey "$ZKEY_FINAL" "$BUILD_DIR/verification_key.json"

echo ""
echo "Step 6: Generating Solidity verifier (for reference)..."
echo "----------------------------------------"
snarkjs zkey export solidityverifier "$ZKEY_FINAL" "$BUILD_DIR/Verifier.sol"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Generated files:"
echo "  - Proving key: $ZKEY_FINAL ($(ls -lh "$ZKEY_FINAL" | awk '{print $5}'))"
echo "  - Verification key: $BUILD_DIR/verification_key.json"
echo "  - Solidity verifier: $BUILD_DIR/Verifier.sol"
echo "  - Circuit WASM: $BUILD_DIR/sphincs_main_js/sphincs_main.wasm"
echo ""
echo "Next steps:"
echo "  1. Copy proving key to relayer: cp $ZKEY_FINAL ../relayer/zk-assets/"
echo "  2. Copy verification key to contract: use in Soroban verifier"
echo "  3. Test with: node scripts/prove.js"
