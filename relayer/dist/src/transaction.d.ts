export declare class TransactionHandler {
    private horizonServer;
    private sorobanServer;
    private relayerKeypair;
    constructor();
    processApproval(txHash: string, stellarAddress: string): Promise<string>;
    private fetchPendingApproval;
    private parsePendingApproval;
    private markConsumed;
}
