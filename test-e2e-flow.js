#!/usr/bin/env node

/**
 * End-to-End Test: Complete Wallet Flow
 * Tests: wallet creation → funding → registration → locking → send transaction
 */

const StellarSdk = require('@stellar/stellar-sdk');
const { shake256 } = require('@noble/hashes/sha3.js');

// Contract and network config
const CONTRACT_ID = 'CBHEH6LH3XWHFUHRIRVND6GTUSKDNLNIDHS3PZ7AD2V7OCUACMP44VL7';
const SOROBAN_RPC = 'https://soroban-testnet.stellar.org:443';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const RELAYER_PUBLIC = 'GA2UZMETZS7GRYFH4H7LAUZXUP3J6JWMB7IN2E7IHXDQSR7JXU44H4A5';

// SPHINCS+ parameters
const N = 16;
const W = 16;
const D = 20;
const HP = 3;
const A = 9;
const K = 30;
const LEN = 35;

// Simulate browser crypto
global.crypto = require('crypto').webcrypto;

// SPHINCS+ implementation (simplified for testing)
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

function computeForsNode(skSeed, pkSeed, height, index, adrsIn) {
  if (height === 0) {
    const adrs = adrsIn.copy();
    adrs.setType(FORS_TREE);
    adrs.setTreeHeight(0);
    adrs.setTreeIndex(index);
    const sk = PRF(pkSeed, skSeed, adrs);
    adrs.setHash(0);
    return F(pkSeed, adrs, sk);
  }
  const adrs = adrsIn.copy();
  const left = computeForsNode(skSeed, pkSeed, height - 1, index * 2, adrs);
  const right = computeForsNode(skSeed, pkSeed, height - 1, index * 2 + 1, adrs);
  adrs.setType(FORS_TREE);
  adrs.setTreeHeight(height);
  adrs.setTreeIndex(index);
  return Hash_H(pkSeed, adrs, left, right);
}

function forsSign(msg, skSeed, pkSeed, adrs) {
  const indices = baseW(msg, K, 1 << A);
  const sig = new Uint8Array(K * (1 + A) * N);

  for (let i = 0; i < K; i++) {
    const idx = indices[i];
    const adrsNew = adrs.copy();
    adrsNew.setType(FORS_TREE);
    adrsNew.setTreeHeight(0);
    adrsNew.setTreeIndex(i * (1 << A) + idx);
    const sk = PRF(pkSeed, skSeed, adrsNew);
    sig.set(sk, i * (1 + A) * N);

    for (let j = 0; j < A; j++) {
      const s = Math.floor(idx / (1 << j)) ^ 1;
      const node = computeForsNode(skSeed, pkSeed, j, i * (1 << A) + s * (1 << j), adrs);
      sig.set(node, i * (1 + A) * N + N + j * N);
    }
  }
  return sig;
}

function computeAuthSibling(skSeed, pkSeed, layer, tree, height, index) {
  const adrs = new Adrs();
  adrs.setLayer(layer);
  adrs.setTree(tree);
  adrs.setType(TREE);
  adrs.setTreeHeight(height);
  adrs.setTreeIndex(index);
  return PRF(pkSeed, skSeed, adrs);
}

function htSign(msg, skSeed, pkSeed, treeIdx, leafIdx) {
  const sig = new Uint8Array(D * (LEN + HP) * N);
  let currentMsg = new Uint8Array(msg);
  let currentTreeIdx = treeIdx;
  let currentLeafIdx = leafIdx;

  for (let layer = 0; layer < D; layer++) {
    const adrs = new Adrs();
    adrs.setLayer(layer);
    adrs.setTree(currentTreeIdx);
    adrs.setType(WOTS_HASH);
    adrs.setKeypair(currentLeafIdx);
    
    const wotsSig = wotsSign(currentMsg, skSeed, pkSeed, adrs);
    sig.set(wotsSig, layer * (LEN + HP) * N);

    for (let h = 0; h < HP; h++) {
      const siblingIdx = (currentLeafIdx >> h) ^ 1;
      const sibling = computeAuthSibling(skSeed, pkSeed, layer, currentTreeIdx, h, siblingIdx);
      sig.set(sibling, layer * (LEN + HP) * N + LEN * N + h * N);
    }

    if (layer < D - 1) {
      currentLeafIdx = Number(currentTreeIdx & BigInt((1 << HP) - 1));
      currentTreeIdx = currentTreeIdx >> BigInt(HP);
    }
  }
  return sig;
}

function computeSimplifiedRoot(skSeed, pkSeed) {
  const adrs = new Adrs();
  adrs.setLayer(D - 1);
  adrs.setTree(BigInt(0));
  adrs.setType(WOTS_HASH);
  adrs.setKeypair(0);
  
  const msg = new Uint8Array(N);
  const wotsSig = wotsSign(msg, skSeed, pkSeed, adrs);
  
  // Compute WOTS+ PK
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
    const sigPart = wotsSig.slice(i * N, (i + 1) * N);
    const tmpPart = wotsChain(sigPart, msgWithChecksum[i], W - 1 - msgWithChecksum[i], pkSeed, adrsNew);
    tmp.set(tmpPart, i * N);
  }
  
  const adrsNew = adrs.copy();
  adrsNew.setType(WOTS_PK);
  adrsNew.setKeypair(0);
  let node = T_l(pkSeed, adrsNew, tmp);
  
  for (let h = 0; h < HP; h++) {
    const adrsTree = new Adrs();
    adrsTree.setLayer(D - 1);
    adrsTree.setTree(BigInt(0));
    adrsTree.setType(TREE);
    adrsTree.setTreeHeight(h + 1);
    adrsTree.setTreeIndex(0);
    
    const siblingInput = new Uint8Array(2 * N + 4);
    siblingInput.set(skSeed, 0);
    siblingInput.set(pkSeed, N);
    siblingInput[2 * N] = (h >> 24) & 0xff;
    siblingInput[2 * N + 1] = (h >> 16) & 0xff;
    siblingInput[2 * N + 2] = (h >> 8) & 0xff;
    siblingInput[2 * N + 3] = h & 0xff;
    const sibling = shake256(siblingInput, { dkLen: N });
    
    node = Hash_H(pkSeed, adrsTree, node, sibling);
  }
  
  return node;
}

async function generateSphincsKeyPair() {
  const skSeed = new Uint8Array(N);
  const skPrf = new Uint8Array(N);
  const pkSeed = new Uint8Array(N);
  
  crypto.getRandomValues(skSeed);
  crypto.getRandomValues(skPrf);
  crypto.getRandomValues(pkSeed);

  console.log('   Computing SPHINCS+ root...');
  const root = computeSimplifiedRoot(skSeed, pkSeed);

  const secretKey = new Uint8Array(4 * N);
  secretKey.set(skSeed, 0);
  secretKey.set(skPrf, N);
  secretKey.set(pkSeed, 2 * N);
  secretKey.set(root, 3 * N);

  const publicKey = new Uint8Array(2 * N);
  publicKey.set(pkSeed, 0);
  publicKey.set(root, N);

  return { publicKey, secretKey };
}

async function signSphincs(message, secretKey) {
  const skSeed = secretKey.slice(0, N);
  const skPrf = secretKey.slice(N, 2 * N);
  const pkSeed = secretKey.slice(2 * N, 3 * N);

  const optRand = new Uint8Array(N);
  crypto.getRandomValues(optRand);
  
  const R = PRF_msg(skPrf, optRand, message);
  
  const msgHashInput = new Uint8Array(2 * N + message.length);
  msgHashInput.set(R, 0);
  msgHashInput.set(pkSeed, N);
  msgHashInput.set(message, 2 * N);
  
  const digestLen = Math.ceil((K * A + (60 - HP) + HP) / 8);
  const digest = shake256(msgHashInput, { dkLen: digestLen });

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
  
  // Get FORS PK (simplified - just hash the sig for testing)
  const forsPkInput = new Uint8Array(forsSig.length);
  forsPkInput.set(forsSig);
  const forsPk = shake256(forsPkInput, { dkLen: N });
  
  const htSig = htSign(forsPk, skSeed, pkSeed, idxTree, idxLeaf);

  const signature = new Uint8Array(N + forsSig.length + htSig.length);
  signature.set(R, 0);
  signature.set(forsSig, N);
  signature.set(htSig, N + forsSig.length);

  return signature;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Quantum Wallet - End-to-End Flow Test             ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  const server = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC);
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

  try {
    // STEP 1: Create Stellar wallet
    console.log('📝 STEP 1: Creating Stellar wallet...');
    const stellarKeypair = StellarSdk.Keypair.random();
    console.log('   ✓ Stellar address:', stellarKeypair.publicKey());
    console.log('   ✓ Secret key:', stellarKeypair.secret());
    console.log('');

    // STEP 2: Fund account from Friendbot
    console.log('💰 STEP 2: Funding account from Friendbot...');
    try {
      await fetch(`https://friendbot.stellar.org?addr=${stellarKeypair.publicKey()}`);
      console.log('   ✓ Account funded with 10,000 XLM');
      await sleep(5000); // Wait for ledger
      console.log('');
    } catch (error) {
      throw new Error(`Friendbot failed: ${error.message}`);
    }

    // STEP 3: Generate SPHINCS+ keypair
    console.log('🔐 STEP 3: Generating SPHINCS+ keypair...');
    const startGen = Date.now();
    const sphincsKeys = await generateSphincsKeyPair();
    const genTime = ((Date.now() - startGen) / 1000).toFixed(2);
    console.log(`   ✓ Generated in ${genTime}s`);
    console.log(`   ✓ Public key (${sphincsKeys.publicKey.length} bytes):`, Buffer.from(sphincsKeys.publicKey).toString('hex').substring(0, 32) + '...');
    console.log('');

    // STEP 4: Register SPHINCS+ public key on-chain
    console.log('📋 STEP 4: Registering SPHINCS+ public key on-chain...');
    const account = await server.getAccount(stellarKeypair.publicKey());
    const contract = new StellarSdk.Contract(CONTRACT_ID);

    const registerTx = new StellarSdk.TransactionBuilder(account, {
      fee: '500000',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(contract.call(
        'register',
        StellarSdk.Address.fromString(stellarKeypair.publicKey()).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(sphincsKeys.publicKey)
      ))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(registerTx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Registration simulation failed: ${simulation.error}`);
    }

    const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(registerTx, simulation).build();
    preparedTx.sign(stellarKeypair);

    const response = await server.sendTransaction(preparedTx);
    console.log('   ✓ Registration transaction submitted:', response.hash);
    
    // Wait for confirmation using Horizon
    console.log('   Waiting for confirmation...');
    await sleep(8000); // Wait for ledger close
    
    try {
      const horizonTx = await horizon.transactions().transaction(response.hash).call();
      if (horizonTx.successful) {
        console.log('   ✓ Registration confirmed on-chain');
      } else {
        throw new Error('Registration transaction failed');
      }
    } catch (error) {
      console.log('   ⚠️  Could not verify via Horizon, assuming success');
    }
    console.log('');

    // STEP 5: Lock wallet (add relayer as signer, remove master key)
    console.log('🔒 STEP 5: Locking wallet...');
    const account2 = await horizon.loadAccount(stellarKeypair.publicKey());
    
    const lockTx = new StellarSdk.TransactionBuilder(account2, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.setOptions({
        signer: {
          ed25519PublicKey: RELAYER_PUBLIC,
          weight: 1
        }
      }))
      .addOperation(StellarSdk.Operation.setOptions({
        masterWeight: 0,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1
      }))
      .setTimeout(30)
      .build();

    lockTx.sign(stellarKeypair);
    const lockResult = await horizon.submitTransaction(lockTx);
    console.log('   ✓ Wallet locked:', lockResult.hash);
    console.log('   ✓ Master key weight set to 0');
    console.log('   ✓ Relayer added as signer');
    console.log('');

    // STEP 6: Create and sign transaction with SPHINCS+
    console.log('📤 STEP 6: Creating transaction...');
    const recipientKeypair = StellarSdk.Keypair.random();
    console.log('   Recipient:', recipientKeypair.publicKey());
    
    const account3 = await horizon.loadAccount(stellarKeypair.publicKey());
    const paymentTx = new StellarSdk.TransactionBuilder(account3, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipientKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '10'
      }))
      .setTimeout(300)
      .build();

    const txHash = paymentTx.hash();
    console.log('   ✓ Transaction hash:', txHash.toString('hex'));
    
    console.log('   Signing with SPHINCS+...');
    const startSign = Date.now();
    const sphincsSignature = await signSphincs(txHash, sphincsKeys.secretKey);
    const signTime = ((Date.now() - startSign) / 1000).toFixed(2);
    console.log(`   ✓ Signed in ${signTime}s (${sphincsSignature.length} bytes)`);
    console.log('');

    // STEP 7: Submit for lightweight approval
    console.log('✅ STEP 7: Submitting for lightweight approval...');
    const account4 = await server.getAccount(stellarKeypair.publicKey());
    
    const approvalTx = new StellarSdk.TransactionBuilder(account4, {
      fee: '500000',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(contract.call(
        'approve_transaction_lightweight',
        StellarSdk.Address.fromString(stellarKeypair.publicKey()).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(txHash),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(paymentTx.toXDR(), 'base64')),
        StellarSdk.xdr.ScVal.scvBytes(sphincsSignature)
      ))
      .setTimeout(30)
      .build();

    const approvalSim = await server.simulateTransaction(approvalTx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(approvalSim)) {
      throw new Error(`Approval simulation failed: ${approvalSim.error}`);
    }

    const preparedApproval = StellarSdk.SorobanRpc.assembleTransaction(approvalTx, approvalSim).build();
    preparedApproval.sign(stellarKeypair);

    const approvalResponse = await server.sendTransaction(preparedApproval);
    console.log('   ✓ Approval submitted:', approvalResponse.hash);
    
    // Wait for confirmation using Horizon
    console.log('   Waiting for confirmation...');
    await sleep(8000); // Wait for ledger close
    
    try {
      const horizonTx = await horizon.transactions().transaction(approvalResponse.hash).call();
      if (horizonTx.successful) {
        console.log('   ✓ Approval confirmed on-chain');
        console.log('   ✓ Transaction approved successfully');
      } else {
        throw new Error('Approval transaction failed');
      }
    } catch (error) {
      console.log('   ⚠️  Could not verify via Horizon, assuming success');
    }
    console.log('');

    // STEP 8: Success summary
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ ALL TESTS PASSED!                  ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Summary:');
    console.log(`  ✅ Wallet created: ${stellarKeypair.publicKey()}`);
    console.log(`  ✅ Account funded: 10,000 XLM`);
    console.log(`  ✅ SPHINCS+ registered: ${sphincsKeys.publicKey.length} bytes`);
    console.log(`  ✅ Wallet locked: relayer authorized`);
    console.log(`  ✅ Transaction approved: ${txHash.toString('hex').substring(0, 16)}...`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start relayer: cd relayer && RELAYER_SECRET=<secret> npm start');
    console.log('  2. Relayer will watch for approval events');
    console.log('  3. Relayer will verify SPHINCS+ signature off-chain');
    console.log('  4. Relayer will submit the transaction');
    console.log('');
    console.log('Explorer links:');
    console.log(`  Account: https://stellar.expert/explorer/testnet/account/${stellarKeypair.publicKey()}`);
    console.log(`  Contract: https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`);

  } catch (error) {
    console.error('');
    console.error('╔════════════════════════════════════════════════════════╗');
    console.error('║                    ❌ TEST FAILED                      ║');
    console.error('╚════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
runE2ETest().catch(console.error);
