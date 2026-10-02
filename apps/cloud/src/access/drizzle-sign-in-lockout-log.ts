import type { SignInLockoutLog, TrippedLockout } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";

export class DrizzleSignInLockoutLog<TQueryResult extends PgQueryResultHKT>
  implements SignInLockoutLog
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordLockout(lockout: TrippedLockout): Promise<void> {
    await this.db.insert(auditLog).values({
      entity: "backoffice_lockout",
      entityId: lockout.lockoutId,
      actorId: null,
      previousValue: null,
      newValue: {
        sourceAddressHash: lockout.sourceAddressHash,
        failureCount: lockout.failureCount,
        blockedUntil: lockout.blockedUntil.toISOString(),
      },
    });
  }
}
