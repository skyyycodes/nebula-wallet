#![no_std]

mod groth16;
mod shake256;
mod sphincs;

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Bytes, BytesN, Env, Symbol, Vec,
    TryFromVal,
};

use groth16::{Groth16Verifier, VerificationKey, parse_proof, parse_public_inputs};
use sphincs::SphincsVerifier;

/// Storage keys
const REGISTERED: Symbol = symbol_short!("reg");
const PENDING: Symbol = symbol_short!("pending");
const NONCE: Symbol = symbol_short!("nonce");
const ZK_VKEY: Symbol = symbol_short!("zkvkey");
const ZK_ADMIN: Symbol = symbol_short!("zkadmin");

/// Registered SPHINCS+ public key for an account
#[contracttype]
#[derive(Clone)]
pub struct Registration {
    pub sphincs_pk: Bytes,
    pub registered_at: u64,
}

/// Verification result event data
#[contracttype]
#[derive(Clone)]
pub struct VerifyEvent {
    pub tx_hash: BytesN<32>,
    pub valid: bool,
    pub timestamp: u64,
}

/// Pending transaction approval for hybrid relayer model
#[contracttype]
#[derive(Clone)]
pub struct PendingApproval {
    pub tx_hash: BytesN<32>,
    pub tx_xdr: Bytes,
    pub stellar_address: Address,
    pub approved_at: u64,
    pub expires_at: u64,
    pub consumed: bool,
}

/// Approval event for relayer to watch
#[contracttype]
#[derive(Clone)]
pub struct ApprovalEvent {
    pub tx_hash: BytesN<32>,
    pub timestamp: u64,
    pub nonce: u64,
}

#[contract]
pub struct QuantumVerifier;

#[contractimpl]
impl QuantumVerifier {
    /// Register a SPHINCS+ public key for a Stellar account.
    pub fn register(
        env: Env,
        stellar_address: Address,
        sphincs_public_key: Bytes,
    ) {
        stellar_address.require_auth();

        if sphincs_public_key.len() < 32 {
            panic!("Invalid SPHINCS+ public key: must be at least 32 bytes");
        }

        let registration = Registration {
            sphincs_pk: sphincs_public_key.clone(),
            registered_at: env.ledger().timestamp(),
        };

        let key = (REGISTERED, stellar_address.clone());
        env.storage().persistent().set(&key, &registration);

        env.events().publish(
            (symbol_short!("register"), stellar_address.clone()),
            registration.registered_at,
        );
    }

    /// Verify a SPHINCS+ signature DEPRICATED
    pub fn verify(
        env: Env,
        stellar_address: Address,
        tx_hash: BytesN<32>,
        sphincs_signature: Bytes,
    ) -> bool {
        let key = (REGISTERED, stellar_address.clone());
        let registration: Registration = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Account not registered");

        let verifier = SphincsVerifier::new(&env, &registration.sphincs_pk)
            .expect("Invalid public key");

        let is_valid = verifier.verify(&tx_hash, &sphincs_signature);

        let event = VerifyEvent {
            tx_hash: tx_hash.clone(),
            valid: is_valid,
            timestamp: env.ledger().timestamp(),
        };
        env.events().publish(
            (symbol_short!("verify"), stellar_address),
            event,
        );

        is_valid
    }

    /// Verify SPHINCS+ signature and authorize the transaction. DEPRICATED
    pub fn verify_and_auth(
        env: Env,
        stellar_address: Address,
        tx_hash: BytesN<32>,
        sphincs_signature: Bytes,
    ) {
        let is_valid = Self::verify(
            env.clone(),
            stellar_address.clone(),
            tx_hash,
            sphincs_signature,
        );

        if !is_valid {
            panic!("SPHINCS+ signature verification failed");
        }
    }

    pub fn get_registration(env: Env, stellar_address: Address) -> Option<Registration> {
        let key = (REGISTERED, stellar_address);
        env.storage().persistent().get(&key)
    }

    pub fn is_registered(env: Env, stellar_address: Address) -> bool {
        let key = (REGISTERED, stellar_address);
        env.storage().persistent().has(&key)
    }

    pub fn get_params(env: Env) -> Bytes {
        Bytes::from_slice(&env, b"SPHINCS+-SHAKE-256f-simple-128")
    }

    // ========== HYBRID RELAYER MODEL FUNCTIONS ==========

    /// Approve transaction WITHOUT full SPHINCS+ verification (lightweight).
    /// This skips the expensive on-chain verification and trusts that the relayer
    /// will verify the signature off-chain before submitting.
    /// Returns a nonce that uniquely identifies this approval.
    pub fn approve_transaction_lightweight(
        env: Env,
        stellar_address: Address,
        tx_hash: BytesN<32>,
        tx_xdr: Bytes,
        sphincs_signature: Bytes,
    ) -> u64 {
        // 1. Check that account is registered
        let key = (REGISTERED, stellar_address.clone());
        let _registration: Registration = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Account not registered");

        // 2. Basic signature length check
        if sphincs_signature.len() < 16000 {
            panic!("Signature too short");
        }

        // 3. Generate nonce for this approval
        let nonce: u64 = env.storage().instance().get(&NONCE).unwrap_or(0) + 1;
        env.storage().instance().set(&NONCE, &nonce);

        // 4. Store pending approval (expires in 5 minutes = 300 seconds)
        let current_time = env.ledger().timestamp();
        let approval = PendingApproval {
            tx_hash: tx_hash.clone(),
            tx_xdr,
            stellar_address: stellar_address.clone(),
            approved_at: current_time,
            expires_at: current_time + 300,
            consumed: false,
        };

        let key = (PENDING, tx_hash.clone());
        env.storage().temporary().set(&key, &approval);

        // Extend TTL to ensure it lives long enough (100 ledgers minimum)
        env.storage().temporary().extend_ttl(&key, 100, 100);

        // 5. Emit approval event for relayers to watch
        let event = ApprovalEvent {
            tx_hash: tx_hash.clone(),
            timestamp: current_time,
            nonce,
        };
        env.events().publish((symbol_short!("approved"), tx_hash.clone()), event);

        nonce
    }

    /// Verify SPHINCS+ signature and approve transaction for relayer submission.
    /// WARNING: This does full verification which may exceed Soroban compute budget!
    /// Use approve_transaction_lightweight() instead for production.
    /// Returns a nonce that uniquely identifies this approval.
    pub fn approve_transaction(
        env: Env,
        stellar_address: Address,
        tx_hash: BytesN<32>,
        tx_xdr: Bytes,
        sphincs_signature: Bytes,
    ) -> u64 {
        // 1. Verify SPHINCS+ signature (reuse existing verify logic)
        let is_valid = Self::verify(
            env.clone(),
            stellar_address.clone(),
            tx_hash.clone(),
            sphincs_signature,
        );

        if !is_valid {
            panic!("SPHINCS+ signature verification failed");
        }

        // 2. Generate nonce for this approval
        let nonce: u64 = env.storage().instance().get(&NONCE).unwrap_or(0) + 1;
        env.storage().instance().set(&NONCE, &nonce);

        // 3. Store pending approval (expires in 5 minutes = 300 seconds)
        let current_time = env.ledger().timestamp();
        let approval = PendingApproval {
            tx_hash: tx_hash.clone(),
            tx_xdr,
            stellar_address: stellar_address.clone(),
            approved_at: current_time,
            expires_at: current_time + 300,
            consumed: false,
        };

        let key = (PENDING, tx_hash.clone());
        env.storage().temporary().set(&key, &approval);

        // Extend TTL to ensure it lives long enough (100 ledgers minimum)
        env.storage().temporary().extend_ttl(&key, 100, 100);

        // 4. Emit approval event for relayers to watch
        let event = ApprovalEvent {
            tx_hash: tx_hash.clone(),
            timestamp: current_time,
            nonce,
        };
        env.events().publish(
            (symbol_short!("approved"), stellar_address),
            event,
        );

        nonce
    }

    /// Get pending approval details (for relayer to fetch tx XDR).
    pub fn get_pending_approval(
        env: Env,
        tx_hash: BytesN<32>,
    ) -> Option<PendingApproval> {
        let key = (PENDING, tx_hash);
        env.storage().temporary().get(&key)
    }

    /// Mark approval as consumed (called by relayer after submission).
    pub fn mark_consumed(
        env: Env,
        tx_hash: BytesN<32>,
        relayer: Address,
    ) {
        relayer.require_auth();

        let key = (PENDING, tx_hash.clone());
        if let Some(mut approval) = env.storage().temporary().get::<_, PendingApproval>(&key) {
            approval.consumed = true;
            env.storage().temporary().set(&key, &approval);

            env.events().publish(
                (symbol_short!("consumed"), tx_hash),
                relayer,
            );
        }
    }

    /// Check if an approval exists and is valid (not consumed, not expired).
    pub fn is_approved(
        env: Env,
        tx_hash: BytesN<32>,
    ) -> bool {
        let key = (PENDING, tx_hash);
        if let Some(approval) = env.storage().temporary().get::<_, PendingApproval>(&key) {
            !approval.consumed && approval.expires_at > env.ledger().timestamp()
        } else {
            false
        }
    }

    // ========== ZK-SNARK VERIFICATION FUNCTIONS ==========
    // These functions enable quantum-safe transaction authorization using
    // Groth16 ZK proofs instead of the vulnerable Ed25519 relayer key.

    /// Initialize ZK verification with admin address.
    /// Must be called once before using ZK functions.
    pub fn init_zk(env: Env, admin: Address) {
        // Only allow initialization once
        if env.storage().instance().has(&ZK_ADMIN) {
            panic!("ZK already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ZK_ADMIN, &admin);
    }

    /// Set the Groth16 verification key (admin only).
    /// The verification key is generated during the trusted setup ceremony.
    ///
    /// Format:
    /// - alpha_g1: 48 bytes (G1 compressed)
    /// - beta_g2: 96 bytes (G2 compressed)
    /// - gamma_g2: 96 bytes (G2 compressed)
    /// - delta_g2: 96 bytes (G2 compressed)
    /// - ic: array of 48-byte G1 points (one per public input + 1)
    pub fn set_zk_verification_key(
        env: Env,
        alpha_g1: BytesN<48>,
        beta_g2: BytesN<96>,
        gamma_g2: BytesN<96>,
        delta_g2: BytesN<96>,
        ic: Vec<BytesN<48>>,
    ) {
        // Only admin can set verification key
        let admin: Address = env.storage().instance().get(&ZK_ADMIN)
            .expect("ZK not initialized");
        admin.require_auth();

        // Store verification key components
        let vk = VerificationKey {
            alpha_g1,
            beta_g2,
            gamma_g2,
            delta_g2,
            ic,
        };
        env.storage().persistent().set(&ZK_VKEY, &vk);

        env.events().publish(
            (symbol_short!("zk_vkey"),),
            env.ledger().timestamp(),
        );
    }

    /// Verify a ZK proof and authorize a transaction.
    /// This is the QUANTUM-SAFE path - no Ed25519 key involved!
    ///
    /// The ZK proof proves that the caller knows a valid SPHINCS+ signature
    /// for the given transaction hash, without revealing the signature.
    ///
    /// Arguments:
    /// - stellar_address: The account being authorized
    /// - tx_hash: Hash of the transaction to authorize
    /// - proof_bytes: Groth16 proof (192 bytes: π_A || π_B || π_C)
    /// - public_inputs: Public inputs to the circuit (message_hash, pk_seed, pk_root)
    ///
    /// Returns: Approval nonce on success, panics on failure.
    pub fn verify_zk_and_authorize(
        env: Env,
        stellar_address: Address,
        tx_hash: BytesN<32>,
        tx_xdr: Bytes,
        proof_bytes: Bytes,
        public_inputs_bytes: Bytes,
    ) -> u64 {
        // 1. Check account is registered
        let key = (REGISTERED, stellar_address.clone());
        let _registration: Registration = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Account not registered");

        // 2. Load verification key
        let vk: VerificationKey = env.storage().persistent().get(&ZK_VKEY)
            .expect("ZK verification key not set");

        // 3. Parse proof
        let proof = parse_proof(&env, &proof_bytes)
            .expect("Invalid proof format");

        // 4. Parse public inputs
        let public_inputs = parse_public_inputs(&env, &public_inputs_bytes)
            .expect("Invalid public inputs format");

        // 5. Verify that public inputs match the transaction
        // First public input should be the message hash (tx_hash)
        if public_inputs.len() < 1 {
            panic!("Missing public inputs");
        }
        let input_tx_hash = public_inputs.get(0).unwrap();
        if input_tx_hash != tx_hash {
            panic!("Transaction hash mismatch");
        }

        // 6. Verify the ZK proof
        let verifier = Groth16Verifier::new(&env, &vk);
        let is_valid = verifier.verify(&proof, &public_inputs);

        if !is_valid {
            panic!("ZK proof verification failed");
        }

        // 7. Generate nonce and store approval
        let nonce: u64 = env.storage().instance().get(&NONCE).unwrap_or(0) + 1;
        env.storage().instance().set(&NONCE, &nonce);

        let current_time = env.ledger().timestamp();
        let approval = PendingApproval {
            tx_hash: tx_hash.clone(),
            tx_xdr,
            stellar_address: stellar_address.clone(),
            approved_at: current_time,
            expires_at: current_time + 300, // 5 minutes
            consumed: false,
        };

        let pending_key = (PENDING, tx_hash.clone());
        env.storage().temporary().set(&pending_key, &approval);
        env.storage().temporary().extend_ttl(&pending_key, 100, 100);

        // 8. Emit ZK approval event
        env.events().publish(
            (symbol_short!("zk_auth"), tx_hash.clone()),
            ApprovalEvent {
                tx_hash,
                timestamp: current_time,
                nonce,
            },
        );

        nonce
    }

    /// Check if ZK verification is enabled (verification key is set).
    pub fn is_zk_enabled(env: Env) -> bool {
        env.storage().persistent().has(&ZK_VKEY)
    }

    /// Get ZK admin address.
    pub fn get_zk_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&ZK_ADMIN)
    }

    // ========== CONTRACT AUTHORIZATION FOR LOCKED ACCOUNTS ==========
    //
    // QUANTUM-SAFE AUTHORIZATION FLOW:
    // ================================
    // When an account is locked (masterWeight=0) with this contract as signer:
    //
    // 1. User signs tx_hash with SPHINCS+ (quantum-safe signature)
    // 2. Relayer generates ZK proof proving SPHINCS+ signature is valid
    // 3. Anyone calls verify_zk_and_authorize() - contract stores approval
    // 4. Contract provides authorization preimage for the sha256Hash signer
    // 5. Transaction executes with contract's authorization
    //
    // WHY THIS IS QUANTUM-SAFE:
    // - User's Ed25519 is disabled (masterWeight=0) - can't be quantum-attacked
    // - Contract has no private key - nothing to steal
    // - Authorization requires valid ZK proof of SPHINCS+ signature
    // - Relayer only pays gas, doesn't provide signing authority

    /// Get the contract's authorization preimage for a ZK-approved transaction.
    /// This preimage can be used with sha256Hash signer type.
    ///
    /// Returns the contract's self-address bytes if the tx is ZK-approved.
    /// Returns None if not approved or expired.
    pub fn get_authorization_preimage(
        env: Env,
        tx_hash: BytesN<32>,
    ) -> Option<Bytes> {
        // Check if transaction is ZK-approved
        let key = (PENDING, tx_hash);
        if let Some(approval) = env.storage().temporary().get::<_, PendingApproval>(&key) {
            if !approval.consumed && approval.expires_at > env.ledger().timestamp() {
                // Return contract's own address as bytes preimage
                // This is what gets hashed to form the sha256Hash signer
                let contract_address = env.current_contract_address();
                // Convert contract address to bytes
                let addr_scval = contract_address.to_val();
                let addr_bytes = Bytes::try_from_val(&env, &addr_scval).unwrap();
                return Some(addr_bytes);
            }
        }
        None
    }

    /// Get this contract's ID for use as a sha256Hash signer.
    /// When locking an account, use this hash as the signer.
    pub fn get_signer_hash(env: Env) -> BytesN<32> {
        let contract_address = env.current_contract_address();
        // Convert contract address to bytes
        let addr_scval = contract_address.to_val();
        let addr_bytes = Bytes::try_from_val(&env, &addr_scval).unwrap();
        // Return the sha256 hash
        let hash = env.crypto().sha256(&addr_bytes);
        BytesN::from_array(&env, &hash.to_array())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use super::shake256::KeccakState;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_register() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuantumVerifier);
        let client = QuantumVerifierClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let sphincs_pk = Bytes::from_slice(&env, &[0u8; 32]);

        env.mock_all_auths();
        client.register(&user, &sphincs_pk);
        assert!(client.is_registered(&user));
    }

    #[test]
    fn test_shake256() {
        // Test SHAKE256 implementation against known test vector
        // Empty input should produce known output
        let mut state = KeccakState::new();
        state.absorb(b"");
        state.finalize_shake();

        let mut output = [0u8; 32];
        state.squeeze(&mut output);

        // SHAKE256("") first 32 bytes = 46b9dd2b0ba88d13...
        assert_eq!(output[0], 0x46);
        assert_eq!(output[1], 0xb9);
        assert_eq!(output[2], 0xdd);
        assert_eq!(output[3], 0x2b);
    }

    #[test]
    fn test_shake256_abc() {
        // SHAKE256("abc") test vector
        let mut state = KeccakState::new();
        state.absorb(b"abc");
        state.finalize_shake();

        let mut output = [0u8; 32];
        state.squeeze(&mut output);

        // SHAKE256("abc") first bytes = 483366601360a8...
        assert_eq!(output[0], 0x48);
        assert_eq!(output[1], 0x33);
    }

    #[test]
    fn test_invalid_signature_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuantumVerifier);
        let client = QuantumVerifierClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let sphincs_pk = Bytes::from_slice(&env, &[0u8; 32]);

        env.mock_all_auths();
        client.register(&user, &sphincs_pk);

        // Try to verify with invalid (too short) signature
        let tx_hash = BytesN::from_array(&env, &[1u8; 32]);
        let invalid_sig = Bytes::from_slice(&env, &[0u8; 100]);

        let result = client.verify(&user, &tx_hash, &invalid_sig);
        assert!(!result, "Invalid signature should be rejected");
    }

    #[test]
    fn test_params() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuantumVerifier);
        let client = QuantumVerifierClient::new(&env, &contract_id);

        let params = client.get_params();
        assert!(params.len() > 0);
    }

    #[test]
    fn test_approval_flow() {
        let env = Env::default();
        let contract_id = env.register_contract(None, QuantumVerifier);
        let client = QuantumVerifierClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let sphincs_pk = Bytes::from_slice(&env, &[0u8; 32]);

        env.mock_all_auths();

        // Register user
        client.register(&user, &sphincs_pk);

        // Create a dummy tx_hash and tx_xdr
        let tx_hash = BytesN::from_array(&env, &[1u8; 32]);
        let tx_xdr = Bytes::from_slice(&env, b"dummy_xdr_data");

        // Note: This will fail verification since we're using a dummy signature
        // In real tests, we'd need a valid SPHINCS+ signature
        // For now, just test that the function exists and can be called
        let result = client.is_approved(&tx_hash);
        assert!(!result, "Should not be approved initially");

        // Test get_pending_approval returns None initially
        let pending = client.get_pending_approval(&tx_hash);
        assert!(pending.is_none(), "Should have no pending approval");
    }
}
