import 'dotenv/config';
export declare const CONFIG: {
    RELAYER_SECRET: string;
    CONTRACT_ID: string;
    NETWORK: string;
    SOROBAN_RPC_URL: string;
    HORIZON_URL: string;
    NETWORK_PASSPHRASE: string;
    POLL_INTERVAL_MS: number;
    APPROVAL_TIMEOUT_MS: number;
};
export declare function validateConfig(): void;
