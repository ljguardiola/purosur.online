import type { PasskeySummary, Passkeys } from "@purosur/domain/access/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys } from "../platform/db/schema.js";

class DrizzlePasskeys<TQueryResult extends PgQueryResultHKT> implements Passkeys {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  passkeySummaries(userId: string): Promise<PasskeySummary[]> {
    return this.db
      .select({
        id: passkeys.id,
        name: passkeys.name,
        createdAt: passkeys.createdAt,
        lastUsedAt: passkeys.lastUsedAt,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.createdAt));
  }
}

export function drizzlePasskeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Passkeys {
  return new DrizzlePasskeys(db);
}
