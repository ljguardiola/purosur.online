import { recoveryTokenStatus } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryTokens } from "../platform/db/schema.js";

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
  return { status: recoveryTokenStatus(row, now), token: row };
}
