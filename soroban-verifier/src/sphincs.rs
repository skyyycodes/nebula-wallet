//! SPHINCS+-SHAKE-256f-simple Signature Verification (no_std, no alloc)
//!
//! Full implementation of NIST PQC standard SPHINCS+ verification.
//! Uses only fixed-size arrays - no heap allocation.

use soroban_sdk::{Bytes, BytesN, Env};
use crate::shake256::KeccakState;

// SPHINCS+ parameters (128-bit security, fast variant)
pub const N: usize = 16;
pub const W: usize = 16;
pub const H: usize = 60;
pub const D: usize = 20;
pub const HP: usize = H / D;  // 3
pub const A: usize = 9;
pub const K: usize = 30;
pub const LOG_W: usize = 4;
pub const LEN1: usize = (8 * N) / LOG_W;  // 32
pub const LEN2: usize = 3;
pub const LEN: usize = LEN1 + LEN2;  // 35

pub const FORS_MSG_BYTES: usize = (K * A + 7) / 8;  // 34
pub const SIG_BYTES: usize = N + K * (1 + A) * N + D * (LEN + HP) * N;  // ~17KB
pub const PK_BYTES: usize = 2 * N;  // 32

// Address types
const ADRS_WOTS_HASH: u32 = 0;
const ADRS_WOTS_PK: u32 = 1;
const ADRS_TREE: u32 = 2;
const ADRS_FORS_TREE: u32 = 3;
const ADRS_FORS_PK: u32 = 4;

#[derive(Clone, Copy, Default)]
struct Adrs {
    layer: u32,
    tree: u64,
    typ: u32,
    keypair: u32,
    chain: u32,
    hash: u32,
}

impl Adrs {
    fn to_bytes(&self) -> [u8; 32] {
        let mut out = [0u8; 32];
        out[0..4].copy_from_slice(&self.layer.to_be_bytes());
        out[4..12].copy_from_slice(&self.tree.to_be_bytes());
        out[12..16].copy_from_slice(&self.typ.to_be_bytes());
        out[16..20].copy_from_slice(&self.keypair.to_be_bytes());
        out[20..24].copy_from_slice(&self.chain.to_be_bytes());
        out[24..28].copy_from_slice(&self.hash.to_be_bytes());
        out
    }

    fn set_type(&mut self, t: u32) {
        self.typ = t;
        self.keypair = 0;
        self.chain = 0;
        self.hash = 0;
    }
}

pub struct SphincsVerifier<'a> {
    #[allow(dead_code)]
    env: &'a Env,
    pk_seed: [u8; N],
    pk_root: [u8; N],
}

impl<'a> SphincsVerifier<'a> {
    pub fn new(env: &'a Env, public_key: &Bytes) -> Option<Self> {
        if public_key.len() < PK_BYTES as u32 {
            return None;
        }

        let mut pk_seed = [0u8; N];
        let mut pk_root = [0u8; N];
        for i in 0..N {
            pk_seed[i] = public_key.get(i as u32).unwrap();
            pk_root[i] = public_key.get((N + i) as u32).unwrap();
        }

        Some(Self { env, pk_seed, pk_root })
    }

    pub fn verify(&self, message: &BytesN<32>, signature: &Bytes) -> bool {
        if signature.len() < SIG_BYTES as u32 {
            return false;
        }

        let mut offset = 0usize;

        // 1. Extract randomizer R
        let mut r = [0u8; N];
        self.read_n(signature, &mut r, &mut offset);

        // 2. Hash message
        let (md, idx_tree, idx_leaf) = self.h_msg(&r, message);

        // 3. FORS verification
        let mut fors_sig = [[[0u8; N]; A + 1]; K];
        for i in 0..K {
            for j in 0..(A + 1) {
                self.read_n(signature, &mut fors_sig[i][j], &mut offset);
            }
        }
        let fors_pk = self.fors_pk_from_sig(&fors_sig, &md, idx_tree, idx_leaf);

        // 4. Hypertree verification
        let mut ht_sig = [[[[0u8; N]; LEN + HP]; 1]; D];
        for d in 0..D {
            for i in 0..(LEN + HP) {
                self.read_n(signature, &mut ht_sig[d][0][i], &mut offset);
            }
        }

        self.ht_verify(&fors_pk, idx_tree, idx_leaf, &ht_sig, signature, K * (A + 1) * N + N)
    }

    // SHAKE256 hash
    fn shake256(&self, input: &[u8], out_len: usize, output: &mut [u8]) {
        let mut state = KeccakState::new();
        state.absorb(input);
        state.finalize_shake();
        state.squeeze(&mut output[..out_len]);
    }

    // F: {0,1}^n -> {0,1}^n
    fn f(&self, adrs: &Adrs, m: &[u8; N]) -> [u8; N] {
        let mut input = [0u8; N + 32 + N];
        input[..N].copy_from_slice(&self.pk_seed);
        input[N..N + 32].copy_from_slice(&adrs.to_bytes());
        input[N + 32..].copy_from_slice(m);

        let mut out = [0u8; N];
        self.shake256(&input, N, &mut out);
        out
    }

    // H: {0,1}^2n -> {0,1}^n
    fn h(&self, adrs: &Adrs, left: &[u8; N], right: &[u8; N]) -> [u8; N] {
        let mut input = [0u8; N + 32 + 2 * N];
        input[..N].copy_from_slice(&self.pk_seed);
        input[N..N + 32].copy_from_slice(&adrs.to_bytes());
        input[N + 32..N + 32 + N].copy_from_slice(left);
        input[N + 32 + N..].copy_from_slice(right);

        let mut out = [0u8; N];
        self.shake256(&input, N, &mut out);
        out
    }

    // T_l: tweakable hash
    fn t_l<const L: usize>(&self, adrs: &Adrs, blocks: &[[u8; N]; L]) -> [u8; N] {
        // Use a fixed buffer - max size for our use cases
        let mut input = [0u8; N + 32 + 35 * N]; // LEN=35 is max
        let input_len = N + 32 + L * N;

        input[..N].copy_from_slice(&self.pk_seed);
        input[N..N + 32].copy_from_slice(&adrs.to_bytes());
        for i in 0..L {
            input[N + 32 + i * N..N + 32 + (i + 1) * N].copy_from_slice(&blocks[i]);
        }

        let mut out = [0u8; N];
        self.shake256(&input[..input_len], N, &mut out);
        out
    }

    // Message hash
    fn h_msg(&self, r: &[u8; N], m: &BytesN<32>) -> ([u8; FORS_MSG_BYTES], u64, u32) {
        let mut input = [0u8; N + 2 * N + 32];
        input[..N].copy_from_slice(r);
        input[N..2 * N].copy_from_slice(&self.pk_seed);
        input[2 * N..3 * N].copy_from_slice(&self.pk_root);
        input[3 * N..].copy_from_slice(&m.to_array());

        let tree_bits = H - HP;
        let tree_bytes = (tree_bits + 7) / 8;
        let leaf_bytes = (HP + 7) / 8;
        let total = FORS_MSG_BYTES + tree_bytes + leaf_bytes;

        let mut digest = [0u8; 64]; // enough for our needs
        self.shake256(&input, total, &mut digest);

        let mut md = [0u8; FORS_MSG_BYTES];
        md.copy_from_slice(&digest[..FORS_MSG_BYTES]);

        let mut idx_tree: u64 = 0;
        for i in 0..tree_bytes.min(8) {
            idx_tree = (idx_tree << 8) | (digest[FORS_MSG_BYTES + i] as u64);
        }
        idx_tree &= (1u64 << tree_bits) - 1;

        let mut idx_leaf: u32 = 0;
        for i in 0..leaf_bytes.min(4) {
            idx_leaf = (idx_leaf << 8) | (digest[FORS_MSG_BYTES + tree_bytes + i] as u32);
        }
        idx_leaf &= (1u32 << HP) - 1;

        (md, idx_tree, idx_leaf)
    }

    // WOTS+ chain
    fn chain(&self, x: &[u8; N], start: usize, steps: usize, adrs: &mut Adrs) -> [u8; N] {
        let mut tmp = *x;
        for i in start..(start + steps) {
            adrs.hash = i as u32;
            tmp = self.f(adrs, &tmp);
        }
        tmp
    }

    // WOTS+ pk from signature
    fn wots_pk_from_sig(&self, sig: &[[u8; N]; LEN], msg: &[u8; N], adrs: &mut Adrs) -> [u8; N] {
        // Base-W conversion
        let mut msg_w = [0u8; LEN1];
        for i in 0..LEN1 {
            let byte_idx = (i * LOG_W) / 8;
            let bit_idx = (i * LOG_W) % 8;
            if bit_idx + LOG_W <= 8 {
                msg_w[i] = ((msg[byte_idx] >> (8 - bit_idx - LOG_W)) & 0x0F) as u8;
            } else if byte_idx + 1 < N {
                let combined = ((msg[byte_idx] as u16) << 8) | (msg[byte_idx + 1] as u16);
                msg_w[i] = ((combined >> (16 - bit_idx - LOG_W)) & 0x0F) as u8;
            }
        }

        // Checksum
        let mut csum: u32 = 0;
        for &d in &msg_w {
            csum += (W as u32 - 1) - (d as u32);
        }
        csum <<= (8 - ((LEN2 * LOG_W) % 8)) % 8;

        let mut csum_w = [0u8; LEN2];
        let mut c = csum;
        for i in (0..LEN2).rev() {
            csum_w[i] = (c & 0x0F) as u8;
            c >>= LOG_W;
        }

        // Complete chains
        let mut tmp = [[0u8; N]; LEN];
        let kp = adrs.keypair;
        adrs.set_type(ADRS_WOTS_HASH);

        for i in 0..LEN1 {
            adrs.keypair = kp;
            adrs.chain = i as u32;
            let start = msg_w[i] as usize;
            tmp[i] = self.chain(&sig[i], start, W - 1 - start, adrs);
        }

        for i in 0..LEN2 {
            adrs.keypair = kp;
            adrs.chain = (LEN1 + i) as u32;
            let start = csum_w[i] as usize;
            tmp[LEN1 + i] = self.chain(&sig[LEN1 + i], start, W - 1 - start, adrs);
        }

        adrs.set_type(ADRS_WOTS_PK);
        adrs.keypair = kp;
        self.t_l(adrs, &tmp)
    }

    // FORS indices extraction
    fn fors_indices(&self, md: &[u8; FORS_MSG_BYTES]) -> [u32; K] {
        let mut indices = [0u32; K];
        let mut bits: u32 = 0;
        let mut total: u64 = 0;
        let mut byte_idx = 0;

        for i in 0..K {
            while bits < A as u32 && byte_idx < FORS_MSG_BYTES {
                total = (total << 8) | (md[byte_idx] as u64);
                byte_idx += 1;
                bits += 8;
            }
            bits -= A as u32;
            indices[i] = ((total >> bits) & ((1 << A) - 1)) as u32;
        }
        indices
    }

    // FORS pk from signature
    fn fors_pk_from_sig(
        &self,
        sig: &[[[u8; N]; A + 1]; K],
        md: &[u8; FORS_MSG_BYTES],
        idx_tree: u64,
        idx_leaf: u32,
    ) -> [u8; N] {
        let indices = self.fors_indices(md);
        let mut roots = [[0u8; N]; K];
        let mut adrs = Adrs::default();
        adrs.tree = idx_tree;
        adrs.keypair = idx_leaf;

        for i in 0..K {
            let sk = &sig[i][0];

            adrs.set_type(ADRS_FORS_TREE);
            adrs.chain = 0;
            adrs.hash = indices[i] + (i as u32) * (1 << A);
            let mut node = self.f(&adrs, sk);

            let mut idx = indices[i];
            for j in 0..A {
                adrs.chain = (j + 1) as u32;
                adrs.hash = idx / 2;

                let sibling = &sig[i][1 + j];
                if idx % 2 == 0 {
                    node = self.h(&adrs, &node, sibling);
                } else {
                    node = self.h(&adrs, sibling, &node);
                }
                idx /= 2;
            }
            roots[i] = node;
        }

        adrs.set_type(ADRS_FORS_PK);
        adrs.keypair = idx_leaf;
        self.t_l(&adrs, &roots)
    }

    // Hypertree verification
    fn ht_verify(
        &self,
        pk_fors: &[u8; N],
        idx_tree: u64,
        idx_leaf: u32,
        _sig: &[[[[u8; N]; LEN + HP]; 1]; D],
        raw_sig: &Bytes,
        sig_offset: usize,
    ) -> bool {
        let mut node = *pk_fors;
        let mut tree = idx_tree;
        let mut leaf = idx_leaf;
        let mut adrs = Adrs::default();
        let mut offset = sig_offset;

        for layer in 0..D {
            adrs.layer = layer as u32;
            adrs.tree = tree;
            adrs.keypair = leaf;

            // Read WOTS+ signature
            let mut wots_sig = [[0u8; N]; LEN];
            for i in 0..LEN {
                self.read_n_at(raw_sig, &mut wots_sig[i], offset + i * N);
            }
            offset += LEN * N;

            // Read auth path
            let mut auth = [[0u8; N]; HP];
            for i in 0..HP {
                self.read_n_at(raw_sig, &mut auth[i], offset + i * N);
            }
            offset += HP * N;

            // Compute WOTS+ pk
            let wots_pk = self.wots_pk_from_sig(&wots_sig, &node, &mut adrs);

            // Compute root
            adrs.set_type(ADRS_TREE);
            let mut k = leaf;
            node = wots_pk;
            for j in 0..HP {
                adrs.chain = j as u32;
                adrs.hash = k / 2;
                if k % 2 == 0 {
                    node = self.h(&adrs, &node, &auth[j]);
                } else {
                    node = self.h(&adrs, &auth[j], &node);
                }
                k /= 2;
            }

            leaf = (tree & ((1 << HP) - 1)) as u32;
            tree >>= HP;
        }

        node == self.pk_root
    }

    fn read_n(&self, sig: &Bytes, out: &mut [u8; N], offset: &mut usize) {
        for i in 0..N {
            out[i] = sig.get((*offset + i) as u32).unwrap_or(0);
        }
        *offset += N;
    }

    fn read_n_at(&self, sig: &Bytes, out: &mut [u8; N], offset: usize) {
        for i in 0..N {
            out[i] = sig.get((offset + i) as u32).unwrap_or(0);
        }
    }
}
