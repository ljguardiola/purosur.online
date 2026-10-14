import type { OffsiteDumpCheckResult, OffsiteDumpFailureReason } from "@purosur/domain";
import type { OffsiteDumpCheckReader } from "@purosur/domain/alerts/use-cases";
import type {
  OffsiteDumpCheckStore,
  OffsiteDumpCheckStoreTransaction,
} from "@purosur/domain/backups/use-cases";
import { and, desc, eq, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offsiteDumpChecks } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

type Executor<TQueryResult extends PgQueryResultHKT> =
  | PgDatabase<TQueryResult>
  | Transaction<TQueryResult>;

async function checkOf<TQueryResult extends PgQueryResultHKT>(
  executor: Executor<TQueryResult>,
  night: string,
): Promise<OffsiteDumpCheckResult | undefined> {
  const [row] = await executor
    .select({
      status: offsiteDumpChecks.status,
      sizeBytes: offsiteDumpChecks.sizeBytes,
      failureReason: offsiteDumpChecks.failureReason,
    })
    .from(offsiteDumpChecks)
    .where(eq(offsiteDumpChecks.night, night));
  if (!row) {
    return undefined;
  }
  return row.status === "verified"
    ? { status: "verified", sizeBytes: row.sizeBytes as number }
    : { status: "failed", reason: row.failureReason as OffsiteDumpFailureReason };
}

class DrizzleOffsiteDumpCheckStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements OffsiteDumpCheckStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async latestVerifiedSizeBefore(night: string): Promise<number | undefined> {
    const [row] = await this.tx
      .select({ sizeBytes: offsiteDumpChecks.sizeBytes })
      .from(offsiteDumpChecks)
      .where(and(eq(offsiteDumpChecks.status, "verified"), lt(offsiteDumpChecks.night, night)))
      .orderBy(desc(offsiteDumpChecks.night))
      .limit(1);
    return row?.sizeBytes ?? undefined;
  }

  async recordResult(night: string, result: OffsiteDumpCheckResult): Promise<void> {
    const recorded =
      result.status === "verified"
        ? { status: result.status, sizeBytes: result.sizeBytes, failureReason: null }
        : { status: result.status, sizeBytes: null, failureReason: result.reason };
    const values = { ...recorded, recordedAt: this.now() };
    await this.tx
      .insert(offsiteDumpChecks)
      .values({ night, ...values })
      .onConflictDoUpdate({ target: offsiteDumpChecks.night, set: values });
  }
}

export class DrizzleOffsiteDumpCheckStore<TQueryResult extends PgQueryResultHKT>
  implements OffsiteDumpCheckStore, OffsiteDumpCheckReader
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: OffsiteDumpCheckStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleOffsiteDumpCheckStoreTransaction(tx, this.now)),
    );
  }

  offsiteDumpCheckOf(night: string): Promise<OffsiteDumpCheckResult | undefined> {
    return checkOf(this.db, night);
  }
}
