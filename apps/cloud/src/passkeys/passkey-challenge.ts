import { and, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeyChallenges } from "../db/schema.js";

/** Generous relative to a WebAuthn prompt's own client-side timeout, so a slow biometric prompt never loses to server-side expiry. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PRUNE_BATCH_SIZE = 100;

export type PasskeyChallengeKind = "registration" | "session_authorization";

export interface StorePendingPasskeyChallengeInput {
  sessionId: string;
  kind: PasskeyChallengeKind;
  reauthenticationChallenge?: string;
  registrationChallenge?: string;
  now: Date;
}

export interface PendingPasskeyChallenge {
  reauthenticationChallenge: string | null;
  registrationChallenge: string | null;
}

export interface ConsumePendingPasskeyChallengeInput {
  sessionId: string;
  kind: PasskeyChallengeKind;
  now: Date;
}

/** Constraint `passkey_challenges_session_id_kind_key` enforces one live row per `(session_id, kind)`. */
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

/** Deletes the row either way: a challenge is redeemable at most once, whether the attempt succeeds or not. */
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
