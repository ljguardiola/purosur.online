import type { SessionStore } from "@purosur/domain/sessions/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sessions } from "../platform/db/schema.js";

class DrizzleSessionStore<TQueryResult extends PgQueryResultHKT> implements SessionStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async endSession(sessionKey: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.sessionIdHash, sessionKey), isNull(sessions.revokedAt)));
  }

  async recordSessionActivity(sessionKey: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastSeenAt: at })
      .where(eq(sessions.sessionIdHash, sessionKey));
  }
}

export function drizzleSessionStore<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): SessionStore {
  return new DrizzleSessionStore(db);
}
