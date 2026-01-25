/**
 * SPHINCS+ Signature Verification for Relayer
 *
 * This performs off-chain SPHINCS+ verification before submitting transactions.
 * Uses the same algorithm as the Soroban contract but runs off-chain to avoid budget limits.
 */
/**
 * Verify SPHINCS+ signature
 */
export declare function verifySphincsSignature(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
/**
 * Get registered SPHINCS+ public key from contract
 */
export declare function getRegisteredPublicKey(contractId: string, stellarAddress: string, sorobanServer: any): Promise<Uint8Array | null>;
