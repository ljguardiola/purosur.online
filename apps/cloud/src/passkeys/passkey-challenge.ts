import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeyChallenges } from "../db/schema.js";

/**
 * How long a passkey self-management challenge (`registration-options` or `removal-options`)
 * stays redeemable. Same lifetime as `sign-in-challenge.ts`'s `CHALLENGE_TTL_MS`: generous
 * relative to a WebAuthn prompt's own client-side timeout, so a slow biometric prompt never loses
 * to server-side expiry.
 */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyChallengeKind = "registration" | "removal";

export interface StorePendingPasskeyChallengeInput {
  sessionId: string;
  kind: PasskeyChallengeKind;
  reauthenticationChallenge: string;
  /** Only set for `kind: "registration"`; a `removal` row never carries one. */
  registrationChallenge?: string;
  now: Date;
}

export interface PendingPasskeyChallenge {
  kind: PasskeyChallengeKind;
  reauthenticationChallenge: string;
  registrationChallenge: string | null;
}

export interface ConsumePendingPasskeyChallengeInput {
  sessionId: string;
  now: Date;
}

/**
 * Stores the freshly issued challenge(s) for a session's pending passkey self-management request,
 * replacing whatever that session already had pending: `passkey_challenges_session_id_key` allows
 * only one live row per session, so this always upserts on `session_id` instead of inserting.
 */
export async function storePendingPasskeyChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: StorePendingPasskeyChallengeInput,
): Promise<void> {
  const values = {
    sessionId: input.sessionId,
    kind: input.kind,
    reauthenticationChallenge: input.reauthenticationChallenge,
    registrationChallenge: input.registrationChallenge ?? null,
    createdAt: input.now,
  };
  await db
    .insert(passkeyChallenges)
    .values(values)
    .onConflictDoUpdate({ target: passkeyChallenges.sessionId, set: values });
}

/**
 * Reports the session's pending passkey challenge, if it has one that is still within its
 * lifetime, and deletes its row either way: a passkey challenge is redeemable at most once,
 * whether the attempt that spends it succeeds or not (the same single-use shape
 * `consumeSignInChallenge` gives sign-in's own challenge).
 */
export async function consumePendingPasskeyChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ConsumePendingPasskeyChallengeInput,
): Promise<PendingPasskeyChallenge | undefined> {
  const [row] = await db
    .delete(passkeyChallenges)
    .where(eq(passkeyChallenges.sessionId, input.sessionId))
    .returning({
      kind: passkeyChallenges.kind,
      reauthenticationChallenge: passkeyChallenges.reauthenticationChallenge,
      registrationChallenge: passkeyChallenges.registrationChallenge,
      createdAt: passkeyChallenges.createdAt,
    });
  if (!row) {
    return undefined;
  }
  if (row.createdAt.getTime() + PASSKEY_CHALLENGE_TTL_MS <= input.now.getTime()) {
    return undefined;
  }
  return {
    kind: row.kind,
    reauthenticationChallenge: row.reauthenticationChallenge,
    registrationChallenge: row.registrationChallenge,
  };
}
