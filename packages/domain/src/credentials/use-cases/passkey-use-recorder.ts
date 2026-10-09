export interface PasskeyUse {
  passkeyId: string;
  counter: number;
  at: Date;
}

export type PasskeyUseRecording = "recorded" | "passkey_removed";

export interface PasskeyUseRecorder {
  // Takes the passkey's row lock, so a concurrent removal of it finds nothing to update
  // here and a removal that came first leaves nothing to record.
  recordPasskeyUse(use: PasskeyUse): Promise<PasskeyUseRecording>;
}
