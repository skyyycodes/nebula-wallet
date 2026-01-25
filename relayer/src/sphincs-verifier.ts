/**
 * SPHINCS+ Signature Verification for Relayer
 * 
 * This performs off-chain SPHINCS+ verification before submitting transactions.
 * Uses the same algorithm as the Soroban contract but runs off-chain to avoid budget limits.
 */

import { shake256 } from '@noble/hashes/sha3.js';

// SPHINCS+-SHAKE-128f-simple parameters
const N = 16;
const W = 16;
const TREE_HEIGHT = 60;
const D = 20;
const HP = 3;
const A = 9;
const K = 30;
const LEN1 = 32;
const LEN2 = 3;
const LEN = 35;

// Address structure (32 bytes)
class Adrs {
  private data: Uint8Array;

  constructor() {
    this.data = new Uint8Array(32);
  }

  setLayer(layer: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(0, layer, false);
  }

  setTree(tree: bigint): void {
    const view = new DataView(this.data.buffer);
    view.setBigUint64(4, tree, false);
  }

  setType(type: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(12, type, false);
  }

  setKeypair(keypair: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(16, keypair, false);
  }

  setChain(chain: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(20, chain, false);
  }

  setHash(hash: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(24, hash, false);
  }

  setTreeHeight(height: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(24, height, false);
  }

  setTreeIndex(index: number): void {
    const view = new DataView(this.data.buffer);
    view.setUint32(28, index, false);
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.data);
  }

  copy(): Adrs {
    const newAdrs = new Adrs();
    newAdrs.data.set(this.data);
    return newAdrs;
  }
}

// Address types
const WOTS_HASH = 0;
const WOTS_PK = 1;
const TREE = 2;
const FORS_TREE = 3;
const FORS_ROOTS = 4;

// Hash functions
function F(pkSeed: Uint8Array, adrs: Adrs, m0: Uint8Array): Uint8Array {
  const input = new Uint8Array(N + 32 + m0.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m0, N + 32);
  return shake256(input, { dkLen: N });
}

function Hash_H(pkSeed: Uint8Array, adrs: Adrs, m0: Uint8Array, m1: Uint8Array): Uint8Array {
  const input = new Uint8Array(N + 32 + m0.length + m1.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m0, N + 32);
  input.set(m1, N + 32 + m0.length);
  return shake256(input, { dkLen: N });
}

function T_l(pkSeed: Uint8Array, adrs: Adrs, m: Uint8Array): Uint8Array {
  const input = new Uint8Array(N + 32 + m.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m, N + 32);
  return shake256(input, { dkLen: N });
}

function baseW(msg: Uint8Array, outLen: number, w: number): number[] {
  const logW = Math.log2(w);
  const out: number[] = [];
  let bits = 0;
  let total = 0;
  let consumed = 0;

  while (out.length < outLen) {
    if (bits === 0) {
      if (consumed >= msg.length) {
        total = 0;
      } else {
        total = msg[consumed];
        consumed++;
      }
      bits = 8;
    }
    bits -= logW;
    out.push((total >> bits) & (w - 1));
  }

  return out;
}

function computeChecksum(msg: Uint8Array): number {
  const msgBaseW = baseW(msg, LEN1, W);
  let csum = 0;
  for (let i = 0; i < LEN1; i++) {
    csum += W - 1 - msgBaseW[i];
  }
  return csum << (8 - ((LEN2 * Math.log2(W)) % 8));
}

function wotsChain(x: Uint8Array, start: number, steps: number, pkSeed: Uint8Array, adrs: Adrs): Uint8Array {
  if (steps === 0) {
    return new Uint8Array(x);
  }

  let tmp = new Uint8Array(x);
  for (let i = start; i < start + steps; i++) {
    adrs.setHash(i);
    tmp = new Uint8Array(F(pkSeed, adrs, tmp));
  }

  return tmp;
}

function wotsPkFromSig(sig: Uint8Array, msg: Uint8Array, pkSeed: Uint8Array, adrs: Adrs): Uint8Array {
  const csum = computeChecksum(msg);
  const msgBaseW = baseW(msg, LEN1, W);
  
  const csumBytes = new Uint8Array(2);
  const view = new DataView(csumBytes.buffer);
  view.setUint16(0, csum, false);
  const csumBaseW = baseW(csumBytes, LEN2, W);
  
  const msgWithChecksum = [...msgBaseW, ...csumBaseW];
  const tmp = new Uint8Array(LEN * N);
  
  for (let i = 0; i < LEN; i++) {
    const adrsNew = adrs.copy();
    adrsNew.setChain(i);
    adrsNew.setHash(msgWithChecksum[i]);
    adrsNew.setType(WOTS_HASH);
    
    const sigPart = sig.slice(i * N, (i + 1) * N);
    const tmpPart = wotsChain(sigPart, msgWithChecksum[i], W - 1 - msgWithChecksum[i], pkSeed, adrsNew);
    tmp.set(tmpPart, i * N);
  }

  const adrsNew = adrs.copy();
  adrsNew.setType(WOTS_PK);
  adrsNew.setKeypair(0);
  return T_l(pkSeed, adrsNew, tmp);
}

function forsPkFromSig(sig: Uint8Array, msg: Uint8Array, pkSeed: Uint8Array, adrs: Adrs): Uint8Array {
  const indices = baseW(msg, K, 1 << A);
  const roots = new Uint8Array(K * N);

  for (let i = 0; i < K; i++) {
    const idx = indices[i];
    const sk = sig.slice(i * (1 + A) * N, i * (1 + A) * N + N);
    
    const adrsNew = adrs.copy();
    adrsNew.setType(FORS_TREE);
    adrsNew.setTreeHeight(0);
    adrsNew.setTreeIndex(i * (1 << A) + idx);
    adrsNew.setHash(0);
    
    let node = F(pkSeed, adrsNew, sk);

    for (let j = 0; j < A; j++) {
      const auth = sig.slice(i * (1 + A) * N + N + j * N, i * (1 + A) * N + N + (j + 1) * N);
      
      const adrsNew2 = adrs.copy();
      adrsNew2.setType(FORS_TREE);
      adrsNew2.setTreeHeight(j + 1);
      const parentIdx = Math.floor(idx / (1 << (j + 1)));
      adrsNew2.setTreeIndex(i * (1 << A) + parentIdx);
      
      const isLeft = (Math.floor(idx / (1 << j)) & 1) === 0;
      
      if (isLeft) {
        node = Hash_H(pkSeed, adrsNew2, node, auth);
      } else {
        node = Hash_H(pkSeed, adrsNew2, auth, node);
      }
    }

    roots.set(node, i * N);
  }

  const adrsNew = adrs.copy();
  adrsNew.setType(FORS_ROOTS);
  adrsNew.setKeypair(0);
  return T_l(pkSeed, adrsNew, roots);
}

/**
 * Verify SPHINCS+ signature
 */
export function verifySphincsSignature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    if (publicKey.length !== 2 * N) {
      console.error('Invalid public key length:', publicKey.length);
      return false;
    }

    const expectedSigLen = N + K * (1 + A) * N + D * (LEN + HP) * N;
    if (signature.length !== expectedSigLen) {
      console.error('Invalid signature length:', signature.length, 'expected:', expectedSigLen);
      return false;
    }

    const pkSeed = publicKey.slice(0, N);
    const pkRoot = publicKey.slice(N, 2 * N);

    // Extract R
    const R = signature.slice(0, N);

    // Hash message with R and pkSeed
    const msgHashInput = new Uint8Array(2 * N + message.length);
    msgHashInput.set(R, 0);
    msgHashInput.set(pkSeed, N);
    msgHashInput.set(message, 2 * N);
    
    const digestLen = Math.ceil((K * A + (TREE_HEIGHT - HP) + HP) / 8);
    const digest = shake256(msgHashInput, { dkLen: digestLen });

    // Extract indices
    const forsBytes = Math.ceil(K * A / 8);
    const treeBytes = Math.ceil((TREE_HEIGHT - HP) / 8);
    const leafBytes = Math.ceil(HP / 8);
    
    const treeIndexBytes = digest.slice(forsBytes, forsBytes + treeBytes);
    let idxTree = BigInt(0);
    for (let i = 0; i < treeIndexBytes.length; i++) {
      idxTree = (idxTree << BigInt(8)) | BigInt(treeIndexBytes[i]);
    }
    idxTree = idxTree & ((BigInt(1) << BigInt(TREE_HEIGHT - HP)) - BigInt(1));
    
    const leafIndexBytes = digest.slice(forsBytes + treeBytes, forsBytes + treeBytes + leafBytes);
    const idxLeafBaseW = baseW(leafIndexBytes, 1, 1 << HP);
    const idxLeaf = idxLeafBaseW[0] & ((1 << HP) - 1);

    // Verify FORS
    const forsSigSize = K * (1 + A) * N;
    const forsSig = signature.slice(N, N + forsSigSize);
    
    const adrs = new Adrs();
    adrs.setLayer(0);
    adrs.setTree(idxTree);
    adrs.setType(FORS_TREE);
    adrs.setKeypair(idxLeaf);
    
    let currentMsg = forsPkFromSig(forsSig, digest.slice(0, forsBytes), pkSeed, adrs);

    // Verify hypertree
    const htSig = signature.slice(N + forsSigSize);
    let currentTreeIdx = idxTree;
    let currentLeafIdx = idxLeaf;

    for (let layer = 0; layer < D; layer++) {
      const adrs = new Adrs();
      adrs.setLayer(layer);
      adrs.setTree(currentTreeIdx);
      
      const wotsSigOffset = layer * (LEN + HP) * N;
      const wotsSig = htSig.slice(wotsSigOffset, wotsSigOffset + LEN * N);
      
      adrs.setType(WOTS_HASH);
      adrs.setKeypair(currentLeafIdx);
      const wotsPk = wotsPkFromSig(wotsSig, currentMsg, pkSeed, adrs);
      
      let node = wotsPk;
      
      // Walk auth path
      for (let h = 0; h < HP; h++) {
        const authOffset = wotsSigOffset + LEN * N + h * N;
        const auth = htSig.slice(authOffset, authOffset + N);
        
        const adrsNew = new Adrs();
        adrsNew.setLayer(layer);
        adrsNew.setTree(currentTreeIdx);
        adrsNew.setType(TREE);
        adrsNew.setTreeHeight(h + 1);
        const parentIdx = Math.floor(currentLeafIdx / (1 << (h + 1)));
        adrsNew.setTreeIndex(parentIdx);
        
        const isLeft = (Math.floor(currentLeafIdx / (1 << h)) & 1) === 0;
        
        if (isLeft) {
          node = Hash_H(pkSeed, adrsNew, node, auth);
        } else {
          node = Hash_H(pkSeed, adrsNew, auth, node);
        }
      }
      
      currentMsg = node;
      
      if (layer < D - 1) {
        currentLeafIdx = Number(currentTreeIdx & BigInt((1 << HP) - 1));
        currentTreeIdx = currentTreeIdx >> BigInt(HP);
      }
    }

    // Compare final node with public key root
    const finalNode = currentMsg;
    for (let i = 0; i < N; i++) {
      if (finalNode[i] !== pkRoot[i]) {
        console.error('Root mismatch at byte', i);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('SPHINCS+ verification error:', error);
    return false;
  }
}

/**
 * Get registered SPHINCS+ public key from contract
 */
export async function getRegisteredPublicKey(
  contractId: string,
  stellarAddress: string,
  sorobanServer: any
): Promise<Uint8Array | null> {
  try {
    const StellarSdk = require('@stellar/stellar-sdk');
    const contract = new StellarSdk.Contract(contractId);

    const tempKeypair = StellarSdk.Keypair.random();
    const tempAccount = new StellarSdk.Account(tempKeypair.publicKey(), '0');

    const addressScVal = StellarSdk.Address.fromString(stellarAddress).toScVal();

    const tx = new StellarSdk.TransactionBuilder(tempAccount, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(contract.call('get_registration', addressScVal))
      .setTimeout(30)
      .build();

    const simulation = await sorobanServer.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      return null;
    }

    if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulation)) {
      return null;
    }

    const result = simulation.result;
    if (!result || !result.retval) {
      return null;
    }

    // Parse Option<Registration>
    const retval = result.retval;
    if (retval.switch().name === 'scvVoid') {
      return null;
    }

    // Unwrap if in vec
    let dataVal = retval;
    if (retval.switch().name === 'scvVec') {
      const vec = retval.vec();
      if (!vec || vec.length === 0) {
        return null;
      }
      dataVal = vec[0];
    }

    if (dataVal.switch().name !== 'scvMap') {
      return null;
    }

    const map = dataVal.map();
    if (!map) {
      return null;
    }

    // Find sphincs_pk field
    for (const entry of map) {
      const key = entry.key();
      const val = entry.val();

      if (key.switch().name !== 'scvSymbol') continue;
      const keyName = key.sym().toString();

      if (keyName === 'sphincs_pk' && val.switch().name === 'scvBytes') {
        return new Uint8Array(val.bytes());
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to get registered public key:', error);
    return null;
  }
}
