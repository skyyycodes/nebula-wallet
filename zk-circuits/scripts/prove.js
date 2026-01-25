/**
 * Test script for generating SPHINCS+ ZK proofs
 * Usage: node scripts/prove.js
 */

const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const WASM_FILE = path.join(BUILD_DIR, 'sphincs_main_js', 'sphincs_main.wasm');
const ZKEY_FILE = path.join(BUILD_DIR, 'sphincs_main_final.zkey');
const VKEY_FILE = path.join(BUILD_DIR, 'verification_key.json');

// SPHINCS+ parameters
const N = 16;  // bytes
const K = 30;  // FORS trees
const A = 9;   // FORS height

/**
 * Generate random bytes
 */
function randomBytes(n) {
    return Array.from(crypto.randomBytes(n));
}

/**
 * Prepare test inputs for the circuit
 * In production, these would come from an actual SPHINCS+ signature
 */
function prepareTestInputs() {
    console.log('Preparing test inputs...');

    // Public inputs
    const messageHash = randomBytes(32);
    const pkSeed = randomBytes(N);
    const pkRoot = randomBytes(N);

    // Private inputs
    const sigR = randomBytes(N);
    const forsSecrets = Array(K).fill(null).map(() => randomBytes(N));
    const forsAuthPaths = Array(K).fill(null).map(() =>
        Array(A).fill(null).map(() => randomBytes(N))
    );
    const forsPkHint = randomBytes(N);
    const htSigCommitment = randomBytes(32);

    return {
        // Public
        messageHash,
        pkSeed,
        pkRoot,
        // Private
        sigR,
        forsSecrets,
        forsAuthPaths,
        forsPkHint,
        htSigCommitment
    };
}

/**
 * Generate a ZK proof
 */
async function generateProof(inputs) {
    console.log('Generating ZK proof...');
    console.log('This may take 30-120 seconds...');

    const startTime = Date.now();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        WASM_FILE,
        ZKEY_FILE
    );

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`Proof generated in ${elapsed.toFixed(2)} seconds`);

    return { proof, publicSignals };
}

/**
 * Verify a proof locally
 */
async function verifyProof(proof, publicSignals) {
    console.log('Verifying proof locally...');

    const vkey = JSON.parse(fs.readFileSync(VKEY_FILE, 'utf8'));
    const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    return verified;
}

/**
 * Export proof in format suitable for Soroban contract
 */
function exportProofForSoroban(proof, publicSignals) {
    // Groth16 proof consists of:
    // - pi_a: G1 point (2 coordinates)
    // - pi_b: G2 point (2x2 coordinates)
    // - pi_c: G1 point (2 coordinates)

    return {
        // Convert to hex strings for Soroban
        pi_a: [proof.pi_a[0], proof.pi_a[1]],
        pi_b: [
            [proof.pi_b[0][0], proof.pi_b[0][1]],
            [proof.pi_b[1][0], proof.pi_b[1][1]]
        ],
        pi_c: [proof.pi_c[0], proof.pi_c[1]],
        publicInputs: publicSignals
    };
}

/**
 * Main
 */
async function main() {
    console.log('=== SPHINCS+ ZK Proof Generation Test ===\n');

    // Check files exist
    if (!fs.existsSync(WASM_FILE)) {
        console.error('Error: Circuit WASM not found. Run ./scripts/compile.sh first');
        process.exit(1);
    }
    if (!fs.existsSync(ZKEY_FILE)) {
        console.error('Error: Proving key not found. Run ./scripts/setup.sh first');
        process.exit(1);
    }

    try {
        // Prepare inputs
        const inputs = prepareTestInputs();
        console.log('Input sizes:');
        console.log(`  - messageHash: ${inputs.messageHash.length} bytes`);
        console.log(`  - pkSeed: ${inputs.pkSeed.length} bytes`);
        console.log(`  - pkRoot: ${inputs.pkRoot.length} bytes`);
        console.log(`  - FORS secrets: ${K} x ${N} bytes`);
        console.log(`  - FORS auth paths: ${K} x ${A} x ${N} bytes`);
        console.log('');

        // Generate proof
        const { proof, publicSignals } = await generateProof(inputs);
        console.log('');

        // Verify
        const verified = await verifyProof(proof, publicSignals);
        console.log(`Verification result: ${verified ? '✅ VALID' : '❌ INVALID'}`);
        console.log('');

        // Export for Soroban
        const sorobanProof = exportProofForSoroban(proof, publicSignals);
        console.log('Proof for Soroban contract:');
        console.log(JSON.stringify(sorobanProof, null, 2));

        // Save proof
        const proofPath = path.join(BUILD_DIR, 'test_proof.json');
        fs.writeFileSync(proofPath, JSON.stringify({ proof, publicSignals }, null, 2));
        console.log(`\nProof saved to: ${proofPath}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('Assert Failed')) {
            console.error('\nCircuit constraints not satisfied. Check inputs.');
        }
        process.exit(1);
    }
}

main();
