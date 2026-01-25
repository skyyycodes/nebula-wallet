export interface ApprovalEvent {
    txHash: string;
    stellarAddress: string;
    timestamp: number;
    nonce: number;
    ledger: number;
}
export declare class EventWatcher {
    private server;
    private lastLedger;
    private processedNonces;
    private isRunning;
    constructor();
    startWatching(onApproval: (event: ApprovalEvent) => Promise<void>): Promise<void>;
    stop(): void;
    private pollEvents;
    private isApprovalEvent;
    private parseApprovalEvent;
}
