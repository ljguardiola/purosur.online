import type { PasskeyUseRecorder } from "./passkey-use-recorder.js";

export interface SessionAuthorizationStore {
  transaction<TOutcome>(
    work: (tx: SessionAuthorizationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface SessionAuthorizationStoreTransaction extends PasskeyUseRecorder {
  authorizeSession(sessionId: string, at: Date): Promise<void>;
}
