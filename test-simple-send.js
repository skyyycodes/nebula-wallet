#!/usr/bin/env node

/**
 * SIMPLE TEST: Use existing registered wallet to send 10 XLM
 * Then VERIFY the balance actually changed
 */

const StellarSdk = require('@stellar/stellar-sdk');
const { shake256 } = require('@noble/hashes/sha3.js');

// Use the existing test account that's already registered
const TEST_ACCOUNT = 'GCL6YDQ7RQZ24XH5IQ2XES27J4I3IBTC5DRHGV6QUN3RFCAID2C3TABL';
const TEST_SECRET = 'SCQGVI5QHNUBCT2XCYIXOOV45KTPYHFFH7NNXO65JRNZVF6CVLNZXGVZ';
const RECIPIENT = 'GCVRATHK4U2QLEWFHAJOIQAJJ56YIHUUQC2FJEGFWITKL3ORAV25EFCC';

const RELAYER_API = 'http://localhost:3001/api';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// SPHINCS+ keys for this account (from your wallet)
const SPHINCS_SECRET_HEX = '8e948ce71eadcad5f7e6c28fd8cc77b1a3e02adbd98e5ff5d53dae7c37f0ff8fd5b485d2f45ff033d46a25c94a09a29cdd8e5e9c9d58f80f0f70ce48bcc4cc2932f7a5a97e520fe8e52145a3b06b5ffcd4f3d2129ba6000e19315cee2a360f127e17e70ec1e14e1993e1d6074b2eeaf7c60a6b7fca5b1f2aeb2dd51dddbb2851';
const SPHINCS_PUBLIC_HEX = '32f7a5a97e520fe8e52145a3b06b5ffcd4f3d2129ba6000e19315cee2a360f127e17e70ec1e14e1993e1d6074b2eeaf7c60a6b7fca5b1f2aeb2dd51dddbb2851';

// SPHINCS+ parameters
const N = 16;
const W = 16;
const D = 20;
const HP = 3;
const A = 9;
const K = 30;
const LEN = 35;

global.crypto = require('crypto').webcrypto;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [Minimal SPHINCS+ implementation - just enough to sign]

class Adrs {
  constructor() {
    this.data = new Uint8Array(32);
  }
  setLayer(layer) {
    const view = new DataView(this.data.buffer);
    view.setUint32(0, layer, false);
  }
  setTree(tree) {
    const view = new DataView(this.data.buffer);
    view.setBigUint64(4, tree, false);
  }
  setType(type) {
    const view = new DataView(this.data.buffer);
    view.setUint32(12, type, false);
  }
  setKeypair(keypair) {
    const view = new DataView(this.data.buffer);
    view.setUint32(16, keypair, false);
  }
  setChain(chain) {
    const view = new DataView(this.data.buffer);
    view.setUint32(20, chain, false);
  }
  setHash(hash) {
    const view = new DataView(this.data.buffer);
    view.setUint32(24, hash, false);
  }
  setTreeHeight(height) {
    const view = new DataView(this.data.buffer);
    view.setUint32(24, height, false);
  }
  setTreeIndex(index) {
    const view = new DataView(this.data.buffer);
    view.setUint32(28, index, false);
  }
  toBytes() {
    return new Uint8Array(this.data);
  }
  copy() {
    const newAdrs = new Adrs();
    newAdrs.data.set(this.data);
    return newAdrs;
  }
}

const WOTS_HASH = 0;
const WOTS_PK = 1;
const TREE = 2;
const FORS_TREE = 3;
const FORS_ROOTS = 4;

function F(pkSeed, adrs, m0) {
  const input = new Uint8Array(N + 32 + m0.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m0, N + 32);
  return shake256(input, { dkLen: N });
}

function Hash_H(pkSeed, adrs, m0, m1) {
  const input = new Uint8Array(N + 32 + m0.length + m1.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m0, N + 32);
  input.set(m1, N + 32 + m0.length);
  return shake256(input, { dkLen: N });
}

function T_l(pkSeed, adrs, m) {
  const input = new Uint8Array(N + 32 + m.length);
  input.set(pkSeed, 0);
  input.set(adrs.toBytes(), N);
  input.set(m, N + 32);
  return shake256(input, { dkLen: N });
}

function PRF(pkSeed, skSeed, adrs) {
  const input = new Uint8Array(N + N + 32);
  input.set(pkSeed, 0);
  input.set(skSeed, N);
  input.set(adrs.toBytes(), 2 * N);
  return shake256(input, { dkLen: N });
}

function PRF_msg(skPrf, optRand, msg) {
  const input = new Uint8Array(N + N + msg.length);
  input.set(skPrf, 0);
  input.set(optRand, N);
  input.set(msg, 2 * N);
  return shake256(input, { dkLen: N });
}

function baseW(msg, outLen, w) {
  const logW = Math.log2(w);
  const out = [];
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

function computeChecksum(msg) {
  const msgBaseW = baseW(msg, 32, W);
  let csum = 0;
  for (let i = 0; i < 32; i++) {
    csum += W - 1 - msgBaseW[i];
  }
  return csum << (8 - ((3 * Math.log2(W)) % 8));
}

function wotsChain(x, start, steps, pkSeed, adrs) {
  if (steps === 0) return new Uint8Array(x);
  let tmp = new Uint8Array(x);
  for (let i = start; i < start + steps; i++) {
    adrs.setHash(i);
    tmp = new Uint8Array(F(pkSeed, adrs, tmp));
  }
  return tmp;
}

function wotsSign(msg, skSeed, pkSeed, adrs) {
  const csum = computeChecksum(msg);
  const msgBaseW = baseW(msg, 32, W);
  const csumBytes = new Uint8Array(2);
  new DataView(csumBytes.buffer).setUint16(0, csum, false);
  const csumBaseW = baseW(csumBytes, 3, W);
  const msgWithChecksum = [...msgBaseW, ...csumBaseW];
  const sig = new Uint8Array(LEN * N);
  
  for (let i = 0; i < LEN; i++) {
    const adrsNew = adrs.copy();
    adrsNew.setChain(i);
    adrsNew.setHash(0);
    adrsNew.setType(WOTS_HASH);
    const sk = PRF(pkSeed, skSeed, adrsNew);
    const sigPart = wotsChain(sk, 0, msgWithChecksum[i], pkSeed, adrsNew);
    sig.set(sigPart, i * N);
  }
  return sig;
}

function wotsPkFromSig(sig, msg, pkSeed, adrs) {
  const csum = computeChecksum(msg);
  const msgBaseW = baseW(msg, 32, W);
  const csumBytes = new Uint8Array(2);
  new DataView(csumBytes.buffer).setUint16(0, csum, false);
  const csumBaseW = baseW(csumBytes, 3, W);
  const msgWithChecksum = [...msgBaseW, ...csumBaseW];
  const tmp = new Uint8Array(LEN * N);
  
  for (let i = 0; i < LEN; i++) {
    const adrsNew = adrs.copy();
    adrsNew.setChain(i);
    adrsNew.setHash(msgWithChecksum[i]);
    adrsNew.setType(WOTS_HASH);
    const sigPart = sig.slice(i * N, (i + 1) * N);
    const chainResult = wotsChain(sigPart, msgWithChecksum[i], W - 1 - msgWithChecksum[i], pkSeed, adrsNew);
    tmp.set(chainResult, i * N);
  }
  
  adrs.setType(WOTS_PK);
  adrs.setKeypair(adrs.toBytes()[19]);
  return T_l(pkSeed, adrs, tmp);
}

function computeForsNode(skSeed, pkSeed, height, index, adrsIn) {
  if (height === 0) {
    const adrs = adrsIn.copy();
    adrs.setTreeHeight(0);
    adrs.setTreeIndex(index);
    const sk = PRF(pkSeed, skSeed, adrs);
    adrs.setType(FORS_TREE);
    return F(pkSeed, adrs, sk);
  }
  
  const leftChild = computeForsNode(skSeed, pkSeed, height - 1, 2 * index, adrsIn);
  const rightChild = computeForsNode(skSeed, pkSeed, height - 1, 2 * index + 1, adrsIn);
  
  const adrs = adrsIn.copy();
  adrs.setTreeHeight(height);
  adrs.setTreeIndex(index);
  adrs.setType(FORS_TREE);
  return Hash_H(pkSeed, adrs, leftChild, rightChild);
}

function forsSign(md, skSeed, pkSeed, adrsIn) {
  const indices = [];
  for (let i = 0; i < K; i++) {
    const offset = i * A;
    const bitsNeeded = A;
    let idx = 0;
    for (let b = 0; b < bitsNeeded; b++) {
      const byteIdx = Math.floor((offset + b) / 8);
      const bitIdx = 7 - ((offset + b) % 8);
      if (byteIdx < md.length) {
        const bit = (md[byteIdx] >> bitIdx) & 1;
        idx = (idx << 1) | bit;
      }
    }
    indices.push(idx);
  }
  
  const sig = new Uint8Array(K * (1 + A) * N);
  let sigOffset = 0;
  
  for (let i = 0; i < K; i++) {
    const adrs = adrsIn.copy();
    adrs.setTreeHeight(0);
    adrs.setTreeIndex(i * (1 << A) + indices[i]);
    const sk = PRF(pkSeed, skSeed, adrs);
    adrs.setType(FORS_TREE);
    const leaf = F(pkSeed, adrs, sk);
    sig.set(leaf, sigOffset);
    sigOffset += N;
    
    let nodeIndex = indices[i];
    let node = new Uint8Array(leaf);
    
    for (let h = 0; h < A; h++) {
      const siblingIndex = nodeIndex ^ 1;
      const sibling = computeForsNode(skSeed, pkSeed, h, siblingIndex, adrsIn);
      sig.set(sibling, sigOffset);
      sigOffset += N;
      
      const adrsHash = adrsIn.copy();
      adrsHash.setTreeHeight(h + 1);
      adrsHash.setTreeIndex(Math.floor(nodeIndex / 2));
      adrsHash.setType(FORS_TREE);
      
      if (nodeIndex % 2 === 0) {
        node = Hash_H(pkSeed, adrsHash, node, sibling);
      } else {
        node = Hash_H(pkSeed, adrsHash, sibling, node);
      }
      
      nodeIndex = Math.floor(nodeIndex / 2);
    }
  }
  
  return sig;
}

function forsPkFromSig(sig, md, pkSeed, adrsIn) {
  const indices = [];
  for (let i = 0; i < K; i++) {
    const offset = i * A;
    const bitsNeeded = A;
    let idx = 0;
    for (let b = 0; b < bitsNeeded; b++) {
      const byteIdx = Math.floor((offset + b) / 8);
      const bitIdx = 7 - ((offset + b) % 8);
      if (byteIdx < md.length) {
        const bit = (md[byteIdx] >> bitIdx) & 1;
        idx = (idx << 1) | bit;
      }
    }
    indices.push(idx);
  }
  
  const roots = [];
  for (let i = 0; i < K; i++) {
    const leafOffset = i * (1 + A) * N;
    let node = sig.slice(leafOffset, leafOffset + N);
    let nodeIndex = indices[i];
    
    for (let h = 0; h < A; h++) {
      const authOffset = leafOffset + (h + 1) * N;
      const auth = sig.slice(authOffset, authOffset + N);
      
      const adrs = adrsIn.copy();
      adrs.setTreeHeight(h + 1);
      adrs.setTreeIndex(Math.floor(nodeIndex / 2));
      adrs.setType(FORS_TREE);
      
      if (nodeIndex % 2 === 0) {
        node = Hash_H(pkSeed, adrs, node, auth);
      } else {
        node = Hash_H(pkSeed, adrs, auth, node);
      }
      
      nodeIndex = Math.floor(nodeIndex / 2);
    }
    
    roots.push(...node);
  }
  
  const adrs = adrsIn.copy();
  adrs.setType(FORS_ROOTS);
  return T_l(pkSeed, adrs, new Uint8Array(roots));
}

async function signSphincs(message, secretKey) {
  const skSeed = secretKey.slice(0, N);
  const skPrf = secretKey.slice(N, 2 * N);
  const pkSeed = secretKey.slice(2 * N, 3 * N);
  const pkRoot = secretKey.slice(3 * N, 4 * N);

  const optRand = new Uint8Array(N);
  crypto.getRandomValues(optRand);

  const R = PRF_msg(skPrf, optRand, message);

  const digest = shake256(
    new Uint8Array([...R, ...pkRoot, ...message]),
    { dkLen: Math.ceil((K * A + 7 * D) / 8) }
  );

  const forsBytes = Math.ceil(K * A / 8);
  const treeBytes = Math.ceil((60 - HP) / 8);
  const leafBytes = Math.ceil(HP / 8);

  const treeIndexBytes = digest.slice(forsBytes, forsBytes + treeBytes);
  let idxTree = BigInt(0);
  for (let i = 0; i < treeIndexBytes.length; i++) {
    idxTree = (idxTree << BigInt(8)) | BigInt(treeIndexBytes[i]);
  }
  idxTree = idxTree & ((BigInt(1) << BigInt(60 - HP)) - BigInt(1));

  const leafIndexBytes = digest.slice(forsBytes + treeBytes, forsBytes + treeBytes + leafBytes);
  const idxLeafBaseW = baseW(leafIndexBytes, 1, 1 << HP);
  const idxLeaf = idxLeafBaseW[0] & ((1 << HP) - 1);

  const adrs = new Adrs();
  adrs.setLayer(0);
  adrs.setTree(idxTree);
  adrs.setType(FORS_TREE);
  adrs.setKeypair(idxLeaf);

  const forsSig = forsSign(digest.slice(0, forsBytes), skSeed, pkSeed, adrs);
  const forsPk = forsPkFromSig(forsSig, digest.slice(0, forsBytes), pkSeed, adrs);

  const htSig = new Uint8Array(D * (LEN + HP) * N);
  let currentMsg = forsPk;
  let currentTreeIdx = idxTree;
  let currentLeafIdx = idxLeaf;

  for (let layer = 0; layer < D; layer++) {
    const adrsLayer = new Adrs();
    adrsLayer.setLayer(layer);
    adrsLayer.setTree(currentTreeIdx);
    adrsLayer.setType(WOTS_HASH);
    adrsLayer.setKeypair(currentLeafIdx);

    const wotsSig = wotsSign(currentMsg, skSeed, pkSeed, adrsLayer);
    htSig.set(wotsSig, layer * (LEN + HP) * N);

    for (let h = 0; h < HP; h++) {
      const siblingInput = new Uint8Array(2 * N + 8);
      siblingInput.set(skSeed, 0);
      siblingInput.set(pkSeed, N);
      siblingInput[2 * N] = (layer >> 24) & 0xff;
      siblingInput[2 * N + 1] = (layer >> 16) & 0xff;
      siblingInput[2 * N + 2] = (layer >> 8) & 0xff;
      siblingInput[2 * N + 3] = layer & 0xff;
      siblingInput[2 * N + 4] = (h >> 24) & 0xff;
      siblingInput[2 * N + 5] = (h >> 16) & 0xff;
      siblingInput[2 * N + 6] = (h >> 8) & 0xff;
      siblingInput[2 * N + 7] = h & 0xff;
      const auth = shake256(siblingInput, { dkLen: N });
      htSig.set(auth, layer * (LEN + HP) * N + LEN * N + h * N);
    }

    const wotsPk = wotsPkFromSig(wotsSig, currentMsg, pkSeed, adrsLayer);
    let node = wotsPk;
    
    for (let h = 0; h < HP; h++) {
      const auth = htSig.slice(layer * (LEN + HP) * N + LEN * N + h * N, layer * (LEN + HP) * N + LEN * N + (h + 1) * N);
      const adrsTree = new Adrs();
      adrsTree.setLayer(layer);
      adrsTree.setTree(currentTreeIdx);
      adrsTree.setType(TREE);
      adrsTree.setTreeHeight(h + 1);
      const parentIdx = Math.floor(currentLeafIdx / (1 << (h + 1)));
      adrsTree.setTreeIndex(parentIdx);
      
      const isLeft = (Math.floor(currentLeafIdx / (1 << h)) & 1) === 0;
      if (isLeft) {
        node = Hash_H(pkSeed, adrsTree, node, auth);
      } else {
        node = Hash_H(pkSeed, adrsTree, auth, node);
      }
    }
    
    currentMsg = node;
    
    if (layer < D - 1) {
      currentLeafIdx = Number(currentTreeIdx & BigInt((1 << HP) - 1));
      currentTreeIdx = currentTreeIdx >> BigInt(HP);
    }
  }

  const signature = new Uint8Array(N + forsSig.length + htSig.length);
  signature.set(R, 0);
  signature.set(forsSig, N);
  signature.set(htSig, N + forsSig.length);

  return signature;
}

async function testSimpleSend() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         SIMPLE TEST: SEND 10 XLM & VERIFY BALANCE        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

  try {
    // Load SPHINCS+ keys
    const sphincsSecretKey = Buffer.from(SPHINCS_SECRET_HEX, 'hex');
    const sphincsPublicKey = Buffer.from(SPHINCS_PUBLIC_HEX, 'hex');
    
    console.log('📋 Using existing account:', TEST_ACCOUNT);
    console.log('📋 SPHINCS+ public key:', sphincsPublicKey.toString('hex').substring(0, 64) + '...');
    console.log('');

    // Check sender's initial balance
    console.log('💰 Checking initial balances...');
    const senderAccount1 = await horizon.loadAccount(TEST_ACCOUNT);
    const senderInitial = parseFloat(senderAccount1.balances.find(b => b.asset_type === 'native').balance);
    console.log('   Sender balance:', senderInitial.toFixed(2), 'XLM');
    
    // Check recipient's initial balance
    let recipientInitial = 0;
    try {
      const recipientAccount1 = await horizon.loadAccount(RECIPIENT);
      recipientInitial = parseFloat(recipientAccount1.balances.find(b => b.asset_type === 'native').balance);
      console.log('   Recipient balance:', recipientInitial.toFixed(2), 'XLM');
    } catch (e) {
      console.log('   Recipient account does not exist yet');
    }
    console.log('');

    // Build payment transaction with SPHINCS+ public key in memo
    console.log('💸 Building payment transaction (10 XLM to recipient)...');
    const senderAccount2 = await horizon.loadAccount(TEST_ACCOUNT);
    
    // Memo hash accepts only 32 bytes, so we use the first 32 bytes of SPHINCS+ public key
    // (which contains pkSeed (16 bytes) + root (16 bytes))
    const sphincsPublicKey32 = sphincsPublicKey.slice(0, 32);
    
    const paymentTx = new StellarSdk.TransactionBuilder(senderAccount2, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: RECIPIENT,
        asset: StellarSdk.Asset.native(),
        amount: '10'
      }))
      .addMemo(StellarSdk.Memo.hash(Buffer.from(sphincsPublicKey32)))
      .setTimeout(30)
      .build();

    const txXdr = paymentTx.toXDR();
    const txHash = paymentTx.hash().toString('hex');
    console.log('   TX Hash:', txHash);
    console.log('');

    // Sign with SPHINCS+
    console.log('✍️  Signing transaction with SPHINCS+...');
    const signature = await signSphincs(paymentTx.hash(), sphincsSecretKey);
    console.log('   Signature length:', signature.length, 'bytes');
    console.log('');

    // Submit to relayer API
    console.log('🚀 Submitting to relayer API...');
    const apiResponse = await fetch(`${RELAYER_API}/submit-approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stellarAddress: TEST_ACCOUNT,
        txHash: txHash,
        txXdr: txXdr,
        sphincsSignature: Buffer.from(signature).toString('base64')
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API returned ${apiResponse.status}: ${errorText}`);
    }

    const apiResult = await apiResponse.json();
    
    if (!apiResult.success) {
      throw new Error(`Relayer API failed: ${apiResult.error}`);
    }
    
    console.log('   ✅ Approval TX:', apiResult.approvalTxHash);
    console.log('   🔗 https://stellar.expert/explorer/testnet/tx/' + apiResult.approvalTxHash);
    
    if (apiResult.paymentTxHash) {
      console.log('   ✅ Payment TX:', apiResult.paymentTxHash);
      console.log('   🔗 https://stellar.expert/explorer/testnet/tx/' + apiResult.paymentTxHash);
    }
    console.log('');

    // Wait for ledger close
    console.log('⏳ Waiting 5 seconds for ledger close...');
    await sleep(5000);
    console.log('');

    // Verify balances
    console.log('✅ Verifying balances...');
    const senderAccount3 = await horizon.loadAccount(TEST_ACCOUNT);
    const senderFinal = parseFloat(senderAccount3.balances.find(b => b.asset_type === 'native').balance);
    
    let recipientFinal = 0;
    try {
      const recipientAccount3 = await horizon.loadAccount(RECIPIENT);
      recipientFinal = parseFloat(recipientAccount3.balances.find(b => b.asset_type === 'native').balance);
    } catch (e) {
      console.log('   ⚠️  Recipient account still does not exist');
    }
    
    console.log('');
    console.log('   📊 SENDER (', TEST_ACCOUNT, ')');
    console.log('      Initial:  ', senderInitial.toFixed(2), 'XLM');
    console.log('      Final:    ', senderFinal.toFixed(2), 'XLM');
    console.log('      Change:   ', (senderFinal - senderInitial).toFixed(2), 'XLM');
    console.log('');
    console.log('   📊 RECIPIENT (', RECIPIENT, ')');
    console.log('      Initial:  ', recipientInitial.toFixed(2), 'XLM');
    console.log('      Final:    ', recipientFinal.toFixed(2), 'XLM');
    console.log('      Change:   ', (recipientFinal - recipientInitial).toFixed(2), 'XLM');
    console.log('');

    // Verify
    const expectedChange = 10.0;
    const actualChange = recipientFinal - recipientInitial;
    
    if (Math.abs(actualChange - expectedChange) < 0.01) {
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║          ✅ SUCCESS! PAYMENT VERIFIED ON-CHAIN!          ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('🎉 Recipient received exactly', actualChange.toFixed(2), 'XLM');
      console.log('');
      console.log('Proof on Stellar Expert:');
      console.log('  Sender: https://stellar.expert/explorer/testnet/account/' + TEST_ACCOUNT);
      console.log('  Recipient: https://stellar.expert/explorer/testnet/account/' + RECIPIENT);
      if (apiResult.paymentTxHash) {
        console.log('  Transaction: https://stellar.expert/explorer/testnet/tx/' + apiResult.paymentTxHash);
      }
      console.log('');
      process.exit(0);
    } else {
      throw new Error(`Balance change mismatch! Expected ~${expectedChange} XLM, got ${actualChange.toFixed(2)} XLM`);
    }

  } catch (error) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║                    ❌ TEST FAILED                         ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
    process.exit(1);
  }
}

testSimpleSend();
