import { isPasskeyCloneSignal } from "../model/passkey-clone-signal.js";
import type { Accounts } from "./accounts.js";
import { findSignInPasskey } from "./find-sign-in-passkey.js";
import type { PasskeyAssertionVerifier } from "./passkey-assertion-verifier.js";
import type { PasskeySignInStore } from "./passkey-sign-in-store.js";

export interface SignInWithPasskeyPorts {
  accounts: Accounts;
  verifier: PasskeyAssertionVerifier;
  store: PasskeySignInStore;
}

export interface SignInWithPasskeyInput {
  credentialId: string;
  attemptId: string;
  previousSessionKey?: string;
  sessionKey: string;
  at: Date;
}

export type SignInWithPasskeyOutcome =
  | { kind: "unknown_passkey" }
  | { kind: "inactive" }
  | { kind: "not_verified" }
  | { kind: "clone_signal" }
  | { kind: "passkey_removed" }
  | { kind: "signed_in" };

export async function signInWithPasskey(
  { accounts, verifier, store }: SignInWithPasskeyPorts,
  input: SignInWithPasskeyInput,
): Promise<SignInWithPasskeyOutcome> {
  const found = await findSignInPasskey({ accounts }, { credentialId: input.credentialId });
  if (found.kind === "unknown") {
    return { kind: "unknown_passkey" };
  }
  if (found.kind === "inactive") {
    return { kind: "inactive" };
  }
  const { passkey } = found;

  const verification = await verifier.verify({
    credentialId: passkey.credentialId,
    publicKey: passkey.publicKey,
    counter: passkey.counter,
    transports: passkey.transports,
  });
  if (!verification.verified) {
    return { kind: "not_verified" };
  }
  if (isPasskeyCloneSignal(passkey.counter, verification.newCounter)) {
    return { kind: "clone_signal" };
  }

  // One transaction, so a failed write can never leave behind a live session whose cookie nobody ever received.
  return store.transaction<SignInWithPasskeyOutcome>(async (tx) => {
    // Locks the passkey's row before any session exists, so a concurrent removal leaves nothing
    // to update here and no session opens for a passkey removed in the meantime.
    const recording = await tx.recordPasskeyUse({
      passkeyId: passkey.id,
      counter: verification.newCounter,
      at: input.at,
    });
    if (recording === "passkey_removed") {
      return { kind: "passkey_removed" };
    }

    if (input.previousSessionKey !== undefined) {
      await tx.endSession(input.previousSessionKey, input.at);
    }
    await tx.openSession({
      userId: passkey.userId,
      sessionKey: input.sessionKey,
      at: input.at,
    });
    await tx.discardSignInAttempt(input.attemptId);
    return { kind: "signed_in" };
  });
}
