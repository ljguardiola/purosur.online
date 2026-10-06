import type { SignInLockoutLog, TrippedLockout } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";
import { hashSourceAddress } from "./sign-in-lockout.js";

export class DrizzleSignInLockoutLog<TQueryResult extends PgQueryResultHKT>
  implements SignInLockoutLog
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  async recordLockout(lockout: TrippedLockout): Promise<void> {
    await this.db.insert(auditLog).values({
      entity: "backoffice_lockout",
      entityId: lockout.lockoutId,
      actorId: null,
      previousValue: null,
      newValue: {
        sourceAddressHash: hashSourceAddress(lockout.sourceAddress),
        failureCount: lockout.failureCount,
        blockedUntil: lockout.blockedUntil.toISOString(),
      },
      at: this.now(),
    });
  }
}
