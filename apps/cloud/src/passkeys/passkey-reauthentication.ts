import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys } from "../db/schema.js";
import type { WebAuthnConfig } from "../recovery/webauthn-config.js";

export interface VerifyPasskeyReauthenticationInput {
  userId: string;
  assertion: AuthenticationResponseJSON;
  expectedChallenge: string;
  webAuthnConfig: WebAuthnConfig;
  now: Date;
}

export type PasskeyReauthenticationResult =
  | { verified: true; passkeyId: string }
  | { verified: false };

/** Scoped to `userId` so another account's matching credential id is never accepted. */
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

  // WebAuthn clone signal: once the counter has left zero, a non-increasing counter means a cloned authenticator.
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
