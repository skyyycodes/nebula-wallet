import * as StellarSdk from '@stellar/stellar-sdk';
import { CONFIG } from './config.js';
import { verifySphincsSignature, getRegisteredPublicKey } from './sphincs-verifier.js';
export class TransactionHandler {
    constructor() {
        this.horizonServer = new StellarSdk.Horizon.Server(CONFIG.HORIZON_URL);
        this.sorobanServer = new StellarSdk.SorobanRpc.Server(CONFIG.SOROBAN_RPC_URL);
        this.relayerKeypair = StellarSdk.Keypair.fromSecret(CONFIG.RELAYER_SECRET);
        console.log(`Relayer public key: ${this.relayerKeypair.publicKey()}`);
    }
    async processApproval(txHash, stellarAddress) {
        console.log(`Processing approval for tx: ${txHash}`);
        // 1. Fetch pending approval from contract
        const approval = await this.fetchPendingApproval(txHash);
        if (!approval) {
            throw new Error('Approval not found or expired');
        }
        if (approval.consumed) {
            throw new Error('Approval already consumed');
        }
        console.log(`Found pending approval for address: ${approval.stellarAddress}`);
        // 2. Get registered SPHINCS+ public key
        console.log('Fetching SPHINCS+ public key from contract...');
        const sphincsPublicKey = await getRegisteredPublicKey(CONFIG.CONTRACT_ID, approval.stellarAddress, this.sorobanServer);
        if (!sphincsPublicKey) {
            throw new Error('No SPHINCS+ public key registered for address');
        }
        console.log(`SPHINCS+ public key found (${sphincsPublicKey.length} bytes)`);
        // 3. Verify SPHINCS+ signature if provided
        if (approval.sphincsSignature) {
            console.log('Verifying SPHINCS+ signature off-chain...');
            const signatureBytes = Buffer.from(approval.sphincsSignature, 'hex');
            const txHashBytes = Buffer.from(txHash, 'hex');
            const isValid = verifySphincsSignature(signatureBytes, txHashBytes, sphincsPublicKey);
            if (!isValid) {
                throw new Error('SPHINCS+ signature verification failed! Transaction rejected.');
            }
            console.log('✓ SPHINCS+ signature verified successfully');
        }
        else {
            console.warn('⚠️  No SPHINCS+ signature in approval - proceeding without verification');
        }
        // 4. Decode transaction XDR
        // 4. Decode transaction XDR
        let transaction;
        try {
            transaction = StellarSdk.TransactionBuilder.fromXDR(approval.txXdr, CONFIG.NETWORK_PASSPHRASE);
        }
        catch (error) {
            throw new Error(`Failed to parse transaction XDR: ${error}`);
        }
        // 5. Verify transaction hash matches
        // 5. Verify transaction hash matches
        const computedHash = transaction.hash().toString('hex');
        if (computedHash !== txHash) {
            throw new Error(`Transaction hash mismatch: expected ${txHash}, got ${computedHash}`);
        }
        console.log('Transaction hash verified');
        // 6. Load source account
        // 6. Load source account
        const sourceAccount = await this.horizonServer.loadAccount(approval.stellarAddress);
        // 7. Check relayer is authorized signer
        // 7. Check relayer is authorized signer
        const relayerSigner = sourceAccount.signers.find((s) => s.key === this.relayerKeypair.publicKey());
        if (!relayerSigner || relayerSigner.weight === 0) {
            throw new Error(`Relayer not authorized on source account. Add ${this.relayerKeypair.publicKey()} as signer.`);
        }
        console.log(`Relayer authorized with weight: ${relayerSigner.weight}`);
        // 8. Build setOptions tx to add preAuthTx signer
        // 8. Build setOptions tx to add preAuthTx signer
        const addPreAuthTx = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
        })
            .addOperation(StellarSdk.Operation.setOptions({
            signer: {
                preAuthTx: transaction.hash(),
                weight: 1,
            },
        }))
            .setTimeout(30)
            .build();
        // 9. Sign with relayer key
        // 9. Sign with relayer key
        addPreAuthTx.sign(this.relayerKeypair);
        console.log('Submitting preAuthTx signer transaction...');
        // 10. Submit preAuthTx signer transaction
        // 10. Submit preAuthTx signer transaction
        try {
            await this.horizonServer.submitTransaction(addPreAuthTx);
            console.log('PreAuthTx signer added successfully');
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Ignore if already added
            if (!errorMsg.includes('op_already_exists')) {
                throw new Error(`Failed to add preAuthTx signer: ${errorMsg}`);
            }
            console.log('PreAuthTx signer already exists, continuing...');
        }
        // 11. Submit original transaction (uses preAuthTx)
        // 11. Submit original transaction (uses preAuthTx)
        console.log('Submitting original transaction...');
        try {
            const result = await this.horizonServer.submitTransaction(transaction);
            console.log(`Transaction submitted successfully: ${result.hash}`);
            // 12. Mark approval as consumed (optional - fire and forget)
            this.markConsumed(txHash).catch(err => {
                console.warn('Failed to mark approval as consumed:', err);
            });
            return result.hash;
        }
        catch (error) {
            throw new Error(`Failed to submit transaction: ${error}`);
        }
    }
    async fetchPendingApproval(txHash) {
        try {
            const contract = new StellarSdk.Contract(CONFIG.CONTRACT_ID);
            // Create a temporary account for simulation
            const tempKeypair = StellarSdk.Keypair.random();
            const tempAccount = new StellarSdk.Account(tempKeypair.publicKey(), '0');
            // Build the call to get_pending_approval
            const txHashBytes = Buffer.from(txHash, 'hex');
            const txHashScVal = StellarSdk.xdr.ScVal.scvBytes(txHashBytes);
            const tx = new StellarSdk.TransactionBuilder(tempAccount, {
                fee: '100',
                networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
            })
                .addOperation(contract.call('get_pending_approval', txHashScVal))
                .setTimeout(30)
                .build();
            // Simulate the transaction
            const simulation = await this.sorobanServer.simulateTransaction(tx);
            if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
                console.error('Simulation error:', simulation.error);
                return null;
            }
            if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulation)) {
                return null;
            }
            // Parse the result
            const result = simulation.result;
            if (!result || !result.retval) {
                return null;
            }
            return this.parsePendingApproval(result.retval);
        }
        catch (error) {
            console.error('Failed to fetch pending approval:', error);
            return null;
        }
    }
    parsePendingApproval(scVal) {
        try {
            // Check if it's an Option::Some
            if (scVal.switch().name === 'scvVoid') {
                return null; // Option::None
            }
            // If it's wrapped in a vec (Option representation), unwrap it
            let dataVal = scVal;
            if (scVal.switch().name === 'scvVec') {
                const vec = scVal.vec();
                if (!vec || vec.length === 0) {
                    return null;
                }
                dataVal = vec[0];
            }
            // Parse the PendingApproval struct
            if (dataVal.switch().name !== 'scvMap') {
                return null;
            }
            const map = dataVal.map();
            if (!map) {
                return null;
            }
            let txHash = '';
            let txXdr = '';
            let stellarAddress = '';
            let approvedAt = 0;
            let expiresAt = 0;
            let consumed = false;
            for (const entry of map) {
                const key = entry.key();
                const val = entry.val();
                if (key.switch().name !== 'scvSymbol')
                    continue;
                const keyName = key.sym().toString();
                switch (keyName) {
                    case 'tx_hash':
                        if (val.switch().name === 'scvBytes') {
                            txHash = Buffer.from(val.bytes()).toString('hex');
                        }
                        break;
                    case 'tx_xdr':
                        if (val.switch().name === 'scvBytes') {
                            txXdr = Buffer.from(val.bytes()).toString('base64');
                        }
                        break;
                    case 'stellar_address':
                        if (val.switch().name === 'scvAddress') {
                            const addr = val.address();
                            if (addr.switch().name === 'scAddressTypeAccount') {
                                const pubKey = addr.accountId().ed25519();
                                stellarAddress = StellarSdk.StrKey.encodeEd25519PublicKey(pubKey);
                            }
                        }
                        break;
                    case 'approved_at':
                        if (val.switch().name === 'scvU64') {
                            approvedAt = Number(val.u64());
                        }
                        break;
                    case 'expires_at':
                        if (val.switch().name === 'scvU64') {
                            expiresAt = Number(val.u64());
                        }
                        break;
                    case 'consumed':
                        if (val.switch().name === 'scvBool') {
                            consumed = val.b();
                        }
                        break;
                }
            }
            if (!txHash || !txXdr) {
                return null;
            }
            return {
                txHash,
                txXdr,
                stellarAddress,
                approvedAt,
                expiresAt,
                consumed,
            };
        }
        catch (error) {
            console.error('Failed to parse pending approval:', error);
            return null;
        }
    }
    async markConsumed(txHash) {
        try {
            const contract = new StellarSdk.Contract(CONFIG.CONTRACT_ID);
            const relayerAccount = await this.sorobanServer.getAccount(this.relayerKeypair.publicKey());
            const txHashBytes = Buffer.from(txHash, 'hex');
            const txHashScVal = StellarSdk.xdr.ScVal.scvBytes(txHashBytes);
            const relayerScVal = StellarSdk.Address.fromString(this.relayerKeypair.publicKey()).toScVal();
            const tx = new StellarSdk.TransactionBuilder(relayerAccount, {
                fee: '100000',
                networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
            })
                .addOperation(contract.call('mark_consumed', txHashScVal, relayerScVal))
                .setTimeout(30)
                .build();
            // Prepare and sign
            const preparedTx = await this.sorobanServer.prepareTransaction(tx);
            preparedTx.sign(this.relayerKeypair);
            // Submit
            await this.sorobanServer.sendTransaction(preparedTx);
            console.log('Marked approval as consumed');
        }
        catch (error) {
            console.warn('Failed to mark consumed (non-critical):', error);
        }
    }
}
