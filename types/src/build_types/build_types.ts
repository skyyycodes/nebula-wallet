import { BuildStatus } from "../prisma/prisma.enums";
import { TerminalSocketData } from "../socket/const";

export interface BuildCacheCheck {
  isCached: boolean;
  codeHash: string | null;
  lastBuildStatus?: BuildStatus;
  lastBuildAt?: Date;
  buildJobId?: string;
  canReuseBuild: boolean;
}

export enum COMMAND {
  NEBULA_BUILD = "NEBULA_BUILD",
  NEBULA_TEST = "NEBULA_TEST",
  NEBULA_DEPLOY_DEVNET = "NEBULA_DEPLOY_DEVNET",
  NEBULA_DEPLOY_MAINNET = "NEBULA_DEPLOY_MAINNET",
  NEBULA_VERIFY = "NEBULA_VERIFY",
}

export interface BaseJobPayload {
  userId: string;
  contractId: string;
  contractName: string;
  timestamp: number;
  jobId: string;
  retryCount?: number;
}

export interface BuildJobPayload extends BaseJobPayload {
  command: COMMAND;
}

export interface BuildJobCompletionPayload extends BaseJobPayload {
  lines: string;
  type: TerminalSocketData;
}

export interface IncomingPayload {
  userId: string;
  contractId: string;
  line: string;
  timestamp: number;
}
