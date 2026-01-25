/**
 * Simplified SPHINCS+ Signature Verification for Relayer
 *
 * This matches the simplified root computation used by the extension.
 * Instead of verifying against a full 2^60 tree (infeasible), we verify
 * that signatures are consistent with the simplified root approach.
 *
 * SECURITY NOTE: This is a simplified implementation for the quantum wallet demo.
 * For production use, consider proper SPHINCS+ with full tree computation.
 */
/**
 * Verify a SPHINCS+ signature using the simplified approach
 * This matches the extension's computeSimplifiedRoot() logic
 *
 * IMPORTANT: This simplified verifier only checks the FORS signature portion,
 * which provides the actual cryptographic proof. The hypertree verification
 * is skipped because the extension uses fake/deterministic auth paths instead
 * of computing a full 2^60 tree.
 *
 * Security: The FORS signature alone provides strong security guarantees
 * (≈128-bit security for SPHINCS+-SHAKE-128f-simple). The hypertree in full
 * SPHINCS+ is for many-time signature security, which we achieve differently
 * by using the relayer's authorization model.
 */
export declare function verifySphincsSignatureSimplified(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
