#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$ROOT_DIR/build"
CIRCUITS_DIR="$ROOT_DIR/circuits"

echo "=== SPHINCS+ ZK Circuit Compilation ==="
echo "Build directory: $BUILD_DIR"

# Create build directory
mkdir -p "$BUILD_DIR"

# Check for circom
if ! command -v circom &> /dev/null; then
    echo "Error: circom not found. Install with:"
    echo "  curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh"
    echo "  git clone https://github.com/iden3/circom.git"
    echo "  cd circom && cargo build --release"
    echo "  sudo cp target/release/circom /usr/local/bin/"
    exit 1
fi

echo ""
echo "Step 1: Compiling circuit..."
echo "----------------------------------------"

# Use simple_test.circom for initial infrastructure testing
# Once working, switch to sphincs_main.circom for full verification
CIRCUIT_FILE="${1:-simple_test.circom}"
echo "Compiling: $CIRCUIT_FILE"

# Compile the circuit
circom "$CIRCUITS_DIR/$CIRCUIT_FILE" \
    --r1cs \
    --wasm \
    --sym \
    --c \
    -o "$BUILD_DIR" \
    -l "$ROOT_DIR/node_modules"

echo ""
echo "Circuit compilation complete!"
echo ""
echo "Generated files:"
ls -la "$BUILD_DIR/"

# Print circuit info
CIRCUIT_BASE=$(basename "$CIRCUIT_FILE" .circom)
echo ""
echo "Circuit statistics:"
if [ -f "$BUILD_DIR/${CIRCUIT_BASE}.r1cs" ]; then
    snarkjs r1cs info "$BUILD_DIR/${CIRCUIT_BASE}.r1cs" 2>/dev/null || echo "(Install snarkjs to see stats)"
fi

echo ""
echo "Next step: Run ./scripts/setup.sh $CIRCUIT_BASE to generate proving keys"
