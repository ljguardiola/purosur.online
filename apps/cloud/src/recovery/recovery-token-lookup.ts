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

/** A token both used/voided and expired reports `burned`: it was consumed before it could expire.
 * A `burned`/`expired` token still comes back with its row, so a rejection can be attributed. */
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
