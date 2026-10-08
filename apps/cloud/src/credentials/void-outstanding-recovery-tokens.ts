import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryTokens } from "../platform/db/schema.js";

export async function voidOutstandingRecoveryTokens<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  userId: string,
  at: Date,
): Promise<void> {
  await tx
    .update(recoveryTokens)
    .set({ voidedAt: at })
    .where(
      and(
        eq(recoveryTokens.userId, userId),
        isNull(recoveryTokens.usedAt),
        isNull(recoveryTokens.voidedAt),
      ),
    );
}
