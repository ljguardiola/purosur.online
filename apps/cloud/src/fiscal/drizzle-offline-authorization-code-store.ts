import type {
  Fortnight,
  KeptOfflineAuthorizationCode,
  OfflineAuthorizationCodeAcquisition,
  OfflineAuthorizationCodeStore,
} from "@purosur/domain/fiscal/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { caeaCodes, registerOfflinePointsOfSale } from "../platform/db/schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { OFFLINE_AUTHORIZATION_CODE_VERSION } from "./offline-authorization-code-version.js";

function offlineAuthorizationCodeLockKey({ start }: Fortnight): string {
  return `caea_code:${start}`;
}

class DrizzleOfflineAuthorizationCodeAcquisition<TQueryResult extends PgQueryResultHKT>
  implements OfflineAuthorizationCodeAcquisition
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly fortnight: Fortnight;

  constructor(db: PgDatabase<TQueryResult>, fortnight: Fortnight) {
    this.db = db;
    this.fortnight = fortnight;
  }

  async isHeld(): Promise<boolean> {
    const [row] = await this.db
      .select({ fortnightStart: caeaCodes.fortnightStart })
      .from(caeaCodes)
      .where(eq(caeaCodes.fortnightStart, this.fortnight.start));
    return row !== undefined;
  }

  async keep({ code, obtainedAt, obtainedThrough }: KeptOfflineAuthorizationCode): Promise<void> {
    await withPendingChanges(this.db, undefined, async (tx, pending) => {
      const [kept] = await tx
        .insert(caeaCodes)
        .values({
          fortnightStart: code.fortnight.start,
          fortnightEnd: code.fortnight.end,
          code: code.code,
          reportDeadline: code.reportDeadline,
          obtainedAt,
          obtainedThrough,
        })
        .returning({ id: caeaCodes.id });
      if (!kept) {
        throw new Error("a kept offline authorization code returned no row");
      }
      pending.note({
        entity: "offline_authorization_code",
        entityId: kept.id,
        version: OFFLINE_AUTHORIZATION_CODE_VERSION,
        op: "insert",
      });
    });
  }
}

// The acquisition holds a session-level advisory lock across the call to ARCA and keeps in
// autocommit, so the database handle must be bound to one connection for the whole acquisition:
// the lock and its release have to run on the connection that took it.
export class DrizzleOfflineAuthorizationCodeStore<TQueryResult extends PgQueryResultHKT>
  implements OfflineAuthorizationCodeStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async hasOfflinePointOfSale(): Promise<boolean> {
    const [row] = await this.db
      .select({ registerId: registerOfflinePointsOfSale.registerId })
      .from(registerOfflinePointsOfSale)
      .limit(1);
    return row !== undefined;
  }

  async holdAcquisition<TOutcome>(
    fortnight: Fortnight,
    work: (acquisition: OfflineAuthorizationCodeAcquisition) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const key = sql`hashtextextended(${offlineAuthorizationCodeLockKey(fortnight)}, 0)`;
    await this.db.execute(sql`select pg_advisory_lock(${key})`);
    try {
      return await work(new DrizzleOfflineAuthorizationCodeAcquisition(this.db, fortnight));
    } finally {
      await this.db.execute(sql`select pg_advisory_unlock(${key})`);
    }
  }
}
