import type {
  LimitedEndpoint,
  RequestAdmission,
  RequestAdmissionTransaction,
} from "@purosur/domain/sync/use-cases";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { installationRequestAttempts } from "../platform/db/schema.js";

class DrizzleRequestAdmissionTransaction<TQueryResult extends PgQueryResultHKT>
  implements RequestAdmissionTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  // Counters have no row of their own to lock before their first request, so each pair takes a
  // transaction-scoped advisory lock instead.
  async lockRequestAttempts(deviceId: string, endpoint: LimitedEndpoint): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`installation_request:${deviceId}:${endpoint}`}, 0))`,
    );
  }

  async admittedRequests(
    deviceId: string,
    endpoint: LimitedEndpoint,
    since: Date,
  ): Promise<Date[]> {
    const rows = await this.tx
      .select({ attemptedAt: installationRequestAttempts.attemptedAt })
      .from(installationRequestAttempts)
      .where(
        and(
          eq(installationRequestAttempts.deviceId, deviceId),
          eq(installationRequestAttempts.endpoint, endpoint),
          gt(installationRequestAttempts.attemptedAt, since),
        ),
      );
    return rows.map((row) => row.attemptedAt);
  }

  async recordAdmittedRequest(
    deviceId: string,
    endpoint: LimitedEndpoint,
    at: Date,
  ): Promise<void> {
    await this.tx
      .insert(installationRequestAttempts)
      .values({ deviceId, endpoint, attemptedAt: at });
  }

  async forgetRequestsThrough(
    deviceId: string,
    endpoint: LimitedEndpoint,
    through: Date,
  ): Promise<void> {
    await this.tx
      .delete(installationRequestAttempts)
      .where(
        and(
          eq(installationRequestAttempts.deviceId, deviceId),
          eq(installationRequestAttempts.endpoint, endpoint),
          lte(installationRequestAttempts.attemptedAt, through),
        ),
      );
  }
}

export class DrizzleRequestAdmission<TQueryResult extends PgQueryResultHKT>
  implements RequestAdmission
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RequestAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRequestAdmissionTransaction(tx)));
  }
}
