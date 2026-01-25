#!/bin/bash
# Deploy Quantum Verifier to Stellar Testnet

set -e

echo "=== Quantum Verifier Deployment ==="
echo ""

# Check if stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo "Error: stellar CLI not found. Install with:"
    echo "  cargo install --locked stellar-cli"
    exit 1
fi

# Build the contract
echo "[1/4] Building contract..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/quantum_verifier.wasm"

if [ ! -f "$WASM_PATH" ]; then
    echo "Error: WASM file not found at $WASM_PATH"
    exit 1
fi

echo "      WASM size: $(wc -c < $WASM_PATH) bytes"

# Configure network
echo ""
echo "[2/4] Configuring testnet..."
stellar network add testnet \
    --rpc-url https://soroban-testnet.stellar.org:443 \
    --network-passphrase "Test SDF Network ; September 2015" \
    2>/dev/null || true

# Generate or use existing identity
IDENTITY_NAME="quantum-deployer"
echo ""
echo "[3/4] Setting up deployer identity..."

if ! stellar keys address $IDENTITY_NAME 2>/dev/null; then
    echo "      Creating new identity: $IDENTITY_NAME"
    stellar keys generate $IDENTITY_NAME --network testnet

    # Fund the account
    echo "      Funding account from friendbot..."
    DEPLOYER_ADDRESS=$(stellar keys address $IDENTITY_NAME)
    curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDRESS" > /dev/null
    sleep 2
fi

DEPLOYER_ADDRESS=$(stellar keys address $IDENTITY_NAME)
echo "      Deployer address: $DEPLOYER_ADDRESS"

# Deploy the contract
echo ""
echo "[4/4] Deploying contract to testnet..."
CONTRACT_ID=$(stellar contract deploy \
    --wasm $WASM_PATH \
    --source $IDENTITY_NAME \
    --network testnet \
    2>&1)

if [[ $CONTRACT_ID == C* ]]; then
    echo ""
    echo "=== DEPLOYMENT SUCCESSFUL ==="
    echo ""
    echo "Contract ID: $CONTRACT_ID"
    echo ""
    echo "Save this contract ID! You'll need it for the extension."
    echo ""

    # Save to file
    echo "$CONTRACT_ID" > contract_id.txt
    echo "Contract ID saved to: contract_id.txt"

    # Test the contract
    echo ""
    echo "Testing contract..."
    stellar contract invoke \
        --id $CONTRACT_ID \
        --source $IDENTITY_NAME \
        --network testnet \
        -- \
        get_params
else
    echo "Deployment failed:"
    echo "$CONTRACT_ID"
    exit 1
fi
