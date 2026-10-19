import type {
  CompromiseResponseAction,
  CompromiseResponseCompletion,
  CompromiseResponseItem,
  PasskeyRemovalResult,
} from "../model/compromise-response.js";

export interface StoredCompromiseResponse {
  id: string;
  startedAt: Date;
  startedBy: string;
  completions: CompromiseResponseCompletion[];
}

export type InstallationRevocationResult = "nothing_to_revoke" | "revoked";

export interface AccountPasskeyRemoval {
  accountId: string;
  administratorId: string;
  locationId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export interface CompromiseResponses {
  findLatestResponse(): Promise<StoredCompromiseResponse | null>;
}

export interface CompromiseResponseStore {
  transaction<TOutcome>(
    work: (tx: CompromiseResponseStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface CompromiseResponseStoreTransaction {
  // Serializes every change to the runbook, so two starts never create two runbooks and two
  // administrators never run the same step twice.
  lockLatestResponse(): Promise<StoredCompromiseResponse | null>;
  startResponse(actorId: string, at: Date): Promise<StoredCompromiseResponse>;
  recordStepDone(
    responseId: string,
    step: CompromiseResponseAction,
    actorId: string,
    at: Date,
  ): Promise<void>;
  recordItemDone(
    responseId: string,
    item: CompromiseResponseItem,
    actorId: string,
    at: Date,
  ): Promise<void>;
  revokeEveryInstallation(actorId: string, at: Date): Promise<InstallationRevocationResult>;
  removeEveryPasskeyOf(removal: AccountPasskeyRemoval): Promise<PasskeyRemovalResult>;
  endEveryBackofficeSession(actorId: string, at: Date): Promise<void>;
  requirePinResetOfEveryUser(actorId: string, at: Date): Promise<void>;
}
