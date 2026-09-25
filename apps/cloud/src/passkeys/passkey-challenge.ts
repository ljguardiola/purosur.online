import { and, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeyChallenges } from "../db/schema.js";

/**
 * How long a pending passkey challenge (`registration-options` or `session/authorization-
 * options`) stays redeemable. Same lifetime as `sign-in-challenge.ts`'s `CHALLENGE_TTL_MS`:
 * generous relative to a WebAuthn prompt's own client-side timeout, so a slow biometric prompt
 * never loses to server-side expiry.
 */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PRUNE_BATCH_SIZE = 100;

export type PasskeyChallengeKind = "registration" | "session_authorization";

export interface StorePendingPasskeyChallengeInput {
  sessionId: string;
  kind: PasskeyChallengeKind;
  /** Only set for `kind: "session_authorization"`; a `registration` row never carries one. */
  reauthenticationChallenge?: string;
  /** Only set for `kind: "registration"`; a `session_authorization` row never carries one. */
  registrationChallenge?: string;
  now: Date;
}

export interface PendingPasskeyChallenge {
  reauthenticationChallenge: string | null;
  registrationChallenge: string | null;
}

export interface ConsumePendingPasskeyChallengeInput {
  sessionId: string;
  /** Only this kind's pending row is looked up, deleted, and returned; the other kind's row (if any) is untouched. */
  kind: PasskeyChallengeKind;
  now: Date;
}

/**
 * Stores the freshly issued challenge for a session's pending passkey self-management request of
 * this kind, replacing whatever that session already had pending under the same kind:
 * `passkey_challenges_session_id_kind_key` allows only one live row per `(session_id, kind)`, so
 * this always upserts on that pair instead of inserting. A pending row of the other kind, if any,
 * is left alone.
 */
export async function storePendingPasskeyChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: StorePendingPasskeyChallengeInput,
): Promise<void> {
  const values = {
    sessionId: input.sessionId,
    kind: input.kind,
    reauthenticationChallenge: input.reauthenticationChallenge ?? null,
    registrationChallenge: input.registrationChallenge ?? null,
    createdAt: input.now,
  };
  await db
    .insert(passkeyChallenges)
    .values(values)
    .onConflictDoUpdate({
      target: [passkeyChallenges.sessionId, passkeyChallenges.kind],
      set: values,
    });
}

/**
 * Reports the session's pending passkey challenge of exactly `kind`, if it has one that is still
 * within its lifetime, and deletes its row either way: a passkey challenge is redeemable at most
 * once, whether the attempt that spends it succeeds or not (the same single-use shape
 * `consumeSignInChallenge` gives sign-in's own challenge). A pending row of the other kind, if
 * any, is left alone: it is looked up, deleted, and consumed independently.
 */
export async function consumePendingPasskeyChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ConsumePendingPasskeyChallengeInput,
): Promise<PendingPasskeyChallenge | undefined> {
  const [row] = await db
    .delete(passkeyChallenges)
    .where(
      and(eq(passkeyChallenges.sessionId, input.sessionId), eq(passkeyChallenges.kind, input.kind)),
    )
    .returning({
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
    reauthenticationChallenge: row.reauthenticationChallenge,
    registrationChallenge: row.registrationChallenge,
  };
}

/** Deletes passkey challenges nobody ever redeemed once they've aged past their lifetime. */
export async function pruneExpiredPasskeyChallenges<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - PASSKEY_CHALLENGE_TTL_MS);
  const expired = db
    .select({ id: passkeyChallenges.id })
    .from(passkeyChallenges)
    .where(lte(passkeyChallenges.createdAt, windowStart))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db.delete(passkeyChallenges).where(inArray(passkeyChallenges.id, expired));
}
