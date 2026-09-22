import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryTokens } from "../db/schema.js";

export interface RecoveryTokenRow {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  voidedAt: Date | null;
  registrationChallenge: string | null;
}

export type RecoveryTokenClassification =
  | { status: "invalid"; token?: undefined }
  | { status: "burned" | "expired" | "valid"; token: RecoveryTokenRow };

/**
 * Classifies a recovery token by its hash, following the priority §9.7/issue #167 fix for both
 * `registration-options` and `redeem`: unknown first (`invalid`), then used or voided by a newer
 * request (`burned`), then past `expires_at` (`expired`) — a token that is both used/voided and
 * expired reports `burned`, since it was consumed before it had the chance to expire. Any token
 * it finds comes back with its row, so a rejected attempt can still be attributed to its account.
 */
export async function classifyRecoveryToken<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  tokenHash: string,
  now: Date,
): Promise<RecoveryTokenClassification> {
  const [row] = await db
    .select({
      id: recoveryTokens.id,
      userId: recoveryTokens.userId,
      expiresAt: recoveryTokens.expiresAt,
      usedAt: recoveryTokens.usedAt,
      voidedAt: recoveryTokens.voidedAt,
      registrationChallenge: recoveryTokens.registrationChallenge,
    })
    .from(recoveryTokens)
    .where(eq(recoveryTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { status: "invalid" };
  }
  if (row.usedAt !== null || row.voidedAt !== null) {
    return { status: "burned", token: row };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { status: "expired", token: row };
  }
  return { status: "valid", token: row };
}
