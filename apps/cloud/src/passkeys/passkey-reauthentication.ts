import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys } from "../db/schema.js";
import type { WebAuthnConfig } from "../recovery/webauthn-config.js";

export interface VerifyPasskeyReauthenticationInput {
  /** The session's own account: an assertion naming another account's credential id is rejected. */
  userId: string;
  assertion: AuthenticationResponseJSON;
  expectedChallenge: string;
  webAuthnConfig: WebAuthnConfig;
  now: Date;
}

export type PasskeyReauthenticationResult =
  | { verified: true; passkeyId: string }
  | { verified: false };

/**
 * Verifies a WebAuthn assertion as a fresh reauthentication against one of `userId`'s own
 * registered passkeys (never another account's, even if the credential id happens to match one)
 * and a challenge this server itself issued and stored for the session, and, on success, updates
 * that passkey's counter and `last_used_at`. Mirrors `session-authenticate-route.ts`'s own
 * verification (including its clone-signal counter check), since this is the same
 * proof-of-possession-plus-user-verification check, performed against an already-open session
 * instead of at sign-in, because registering or removing a passkey requires it.
 */
export async function verifyPasskeyReauthentication<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: VerifyPasskeyReauthenticationInput,
): Promise<PasskeyReauthenticationResult> {
  const [passkey] = await db
    .select({
      id: passkeys.id,
      credentialId: passkeys.credentialId,
      publicKey: passkeys.publicKey,
      counter: passkeys.counter,
      transports: passkeys.transports,
    })
    .from(passkeys)
    .where(and(eq(passkeys.credentialId, input.assertion.id), eq(passkeys.userId, input.userId)))
    .limit(1);
  if (!passkey) {
    return { verified: false };
  }

  const verification = await verifyAuthenticationResponse({
    response: input.assertion,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.webAuthnConfig.expectedOrigin,
    expectedRPID: input.webAuthnConfig.rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
      ...(passkey.transports ? { transports: passkey.transports } : {}),
    },
    requireUserVerification: true,
  }).catch(() => ({ verified: false as const }));
  if (!verification.verified) {
    return { verified: false };
  }
  const { authenticationInfo } = verification;

  // Same clone-signal guard session-authenticate-route.ts applies at sign-in: once the
  // authenticator's counter has ever left zero, an assertion that doesn't exceed the stored value
  // is a clone signal, rejected like any other failed reauthentication.
  const isCloneSignal = passkey.counter > 0 && authenticationInfo.newCounter <= passkey.counter;
  if (isCloneSignal) {
    return { verified: false };
  }

  await db
    .update(passkeys)
    .set({
      lastUsedAt: input.now,
      ...(authenticationInfo.newCounter !== passkey.counter
        ? { counter: authenticationInfo.newCounter }
        : {}),
    })
    .where(eq(passkeys.id, passkey.id));

  return { verified: true, passkeyId: passkey.id };
}
