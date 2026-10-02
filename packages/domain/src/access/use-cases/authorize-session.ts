import { isPasskeyCloneSignal } from "../model/passkey-clone-signal.js";
import type { PasskeyAssertionVerifier } from "./passkey-assertion-verifier.js";
import type { Passkeys } from "./passkeys.js";
import type { SessionAuthorizationStore } from "./session-authorization-store.js";

export interface AuthorizeSessionPorts {
  passkeys: Passkeys;
  verifier: PasskeyAssertionVerifier;
  store: SessionAuthorizationStore;
}

export interface AuthorizeSessionInput {
  userId: string;
  sessionId: string;
  credentialId: string;
  at: Date;
}

export type AuthorizeSessionOutcome =
  | { kind: "not_verified" }
  | { kind: "clone_signal" }
  | { kind: "authorized" };

export async function authorizeSession(
  { passkeys, verifier, store }: AuthorizeSessionPorts,
  input: AuthorizeSessionInput,
): Promise<AuthorizeSessionOutcome> {
  const passkey = await passkeys.passkeyByCredentialId(input.userId, input.credentialId);
  if (!passkey) {
    return { kind: "not_verified" };
  }

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

  return store.transaction<AuthorizeSessionOutcome>(async (tx) => {
    const recording = await tx.recordPasskeyUse({
      passkeyId: passkey.id,
      counter: verification.newCounter,
      at: input.at,
    });
    if (recording === "passkey_removed") {
      return { kind: "not_verified" };
    }
    await tx.authorizeSession(input.sessionId, input.at);
    return { kind: "authorized" };
  });
}
