import type { PasskeyUseRecorder } from "./passkey-use-recorder.js";

export interface OpenedSession {
  userId: string;
  sessionKey: string;
  at: Date;
}

export interface PasskeySignInStore {
  transaction<TOutcome>(
    work: (tx: PasskeySignInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PasskeySignInStoreTransaction extends PasskeyUseRecorder {
  endSession(sessionKey: string, at: Date): Promise<void>;
  openSession(session: OpenedSession): Promise<void>;
  discardSignInAttempt(attemptId: string): Promise<void>;
}
