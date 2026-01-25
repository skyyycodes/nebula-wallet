//! SHAKE256 Implementation (no_std, no alloc)
//!
//! SHAKE256 XOF based on Keccak-f[1600] permutation.

const KECCAK_ROUNDS: usize = 24;
const SHAKE256_RATE: usize = 136;

const RC: [u64; 24] = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
    0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];

const ROTATION: [[u32; 5]; 5] = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
];

pub struct KeccakState {
    state: [u64; 25],
    offset: usize,
}

impl KeccakState {
    pub fn new() -> Self {
        KeccakState {
            state: [0u64; 25],
            offset: 0,
        }
    }

    pub fn absorb(&mut self, data: &[u8]) {
        let mut idx = 0;

        while idx < data.len() {
            let to_absorb = core::cmp::min(SHAKE256_RATE - self.offset, data.len() - idx);

            for i in 0..to_absorb {
                let state_byte_idx = self.offset + i;
                let word_idx = state_byte_idx / 8;
                let byte_idx = state_byte_idx % 8;
                self.state[word_idx] ^= (data[idx + i] as u64) << (8 * byte_idx);
            }

            self.offset += to_absorb;
            idx += to_absorb;

            if self.offset == SHAKE256_RATE {
                self.keccak_f();
                self.offset = 0;
            }
        }
    }

    pub fn finalize_shake(&mut self) {
        let word_idx = self.offset / 8;
        let byte_idx = self.offset % 8;
        self.state[word_idx] ^= 0x1Fu64 << (8 * byte_idx);

        let last_byte_idx = SHAKE256_RATE - 1;
        let last_word_idx = last_byte_idx / 8;
        let last_bit_idx = last_byte_idx % 8;
        self.state[last_word_idx] ^= 0x80u64 << (8 * last_bit_idx);

        self.keccak_f();
        self.offset = 0;
    }

    pub fn squeeze(&mut self, output: &mut [u8]) {
        let mut idx = 0;

        while idx < output.len() {
            if self.offset == SHAKE256_RATE {
                self.keccak_f();
                self.offset = 0;
            }

            let to_squeeze = core::cmp::min(SHAKE256_RATE - self.offset, output.len() - idx);

            for i in 0..to_squeeze {
                let state_byte_idx = self.offset + i;
                let word_idx = state_byte_idx / 8;
                let byte_idx = state_byte_idx % 8;
                output[idx + i] = ((self.state[word_idx] >> (8 * byte_idx)) & 0xFF) as u8;
            }

            self.offset += to_squeeze;
            idx += to_squeeze;
        }
    }

    fn keccak_f(&mut self) {
        for round in 0..KECCAK_ROUNDS {
            // θ (theta)
            let mut c = [0u64; 5];
            for x in 0..5 {
                c[x] = self.state[x] ^ self.state[x + 5] ^ self.state[x + 10]
                    ^ self.state[x + 15] ^ self.state[x + 20];
            }

            let mut d = [0u64; 5];
            for x in 0..5 {
                d[x] = c[(x + 4) % 5] ^ c[(x + 1) % 5].rotate_left(1);
            }

            for x in 0..5 {
                for y in 0..5 {
                    self.state[x + 5 * y] ^= d[x];
                }
            }

            // ρ (rho) and π (pi)
            let mut b = [0u64; 25];
            for x in 0..5 {
                for y in 0..5 {
                    let new_x = y;
                    let new_y = (2 * x + 3 * y) % 5;
                    b[new_x + 5 * new_y] = self.state[x + 5 * y].rotate_left(ROTATION[x][y]);
                }
            }

            // χ (chi)
            for x in 0..5 {
                for y in 0..5 {
                    self.state[x + 5 * y] = b[x + 5 * y]
                        ^ ((!b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]);
                }
            }

            // ι (iota)
            self.state[0] ^= RC[round];
        }
    }
}
