/**
 * Server-Side ZK Prover for SPHINCS+ Signature Verification
 *
 * This module generates Groth16 ZK-SNARK proofs that cryptographically verify
 * the validity of SPHINCS+ signatures without revealing the signature data itself.
 *
 * The generated proofs are:
 * - Constant size (192 bytes) regardless of signature size
 * - Efficiently verifiable on-chain by the Soroban contract
 * - Zero-knowledge: reveal nothing about the signature
 * - Quantum-safe: based on hash function security assumptions
 *
 * # Architecture
 *
 * 1. Parse SPHINCS+ signature components (R, FORS signature, hypertree signature)
 * 2. Extract circuit witnesses from signature structure
 * 3. Generate Groth16 proof using trusted setup parameters
 * 4. Serialize proof to BLS12-381 compressed format for on-chain verification
 *
 * # Security
 *
 * The ZK circuit proves that the prover knows:
 * - A valid SPHINCS+ signature on the transaction hash
 * - Matching the registered SPHINCS+ public key
 * - Without revealing any part of the signature itself
 */
/**
 * Groth16 proof structure
 */
export interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
}
/**
 * ZK proof result including proof and public inputs
 */
export interface ZKProofResult {
    proof: Groth16Proof;
    publicSignals: string[];
    proofBytes: Buffer;
    publicInputsBytes: Buffer;
}
/**
 * Check if ZK proving infrastructure is properly configured.
 *
 * Verifies that all required trusted setup artifacts are present:
 * - Circuit WASM: Compiled circuit for witness generation
 * - Proving key (zkey): Parameters for proof generation
 *
 * These files are generated during the trusted setup ceremony and
 * are required for generating ZK proofs.
 */
export declare function isZKEnabled(): boolean;
/**
 * Generate a zero-knowledge proof of SPHINCS+ signature validity.
 *
 * This is the main entry point for ZK proof generation. It:
 * 1. Validates input parameters
 * 2. Parses the SPHINCS+ signature structure
 * 3. Extracts circuit witnesses
 * 4. Generates a Groth16 proof using the trusted setup
 * 5. Serializes the proof for on-chain verification
 *
 * The resulting proof is constant-size (192 bytes) and can be verified
 * efficiently on-chain, regardless of the signature size (~17KB).
 *
 * @param messageHash - 32-byte hash of the transaction being signed
 * @param publicKey - SPHINCS+ public key (32 bytes: pkSeed || pkRoot)
 * @param signature - Complete SPHINCS+ signature (~17KB for SHAKE-128f-simple)
 * @returns ZK proof with serialized bytes ready for smart contract verification
 *
 * @throws Error if ZK assets are not configured or inputs are invalid
 *
 * Performance: Proof generation typically takes 30-120 seconds depending on
 * hardware. This is acceptable for a relayer service that batches operations.
 */
export declare function generateZKProof(messageHash: Uint8Array, publicKey: Uint8Array, signature: Uint8Array): Promise<ZKProofResult>;
/**
 * Verify a ZK proof locally using the verification key.
 *
 * This performs the same verification that would happen on-chain,
 * useful for testing and debugging before submitting to the blockchain.
 *
 * The verification checks the Groth16 pairing equation:
 * e(π_A, π_B) = e(α, β) · e(L, γ) · e(π_C, δ)
 *
 * @param proof - The Groth16 proof to verify
 * @param publicSignals - Public inputs that should match the proof
 * @returns true if proof is cryptographically valid, false otherwise
 */
export declare function verifyZKProofLocally(proof: Groth16Proof, publicSignals: string[]): Promise<boolean>;
/**
 * Retrieve the verification key for smart contract deployment.
 *
 * The verification key contains the public parameters from the trusted setup
 * that are needed to verify proofs on-chain. This includes:
 * - α, β, γ, δ: Verification key components (elliptic curve points)
 * - IC: Input commitment points (one per public input + 1)
 *
 * The contract stores these parameters and uses them to verify all subsequent
 * proofs without needing the full proving key.
 *
 * @returns Verification key object formatted for contract deployment
 */
export declare function getVerificationKey(): any;
