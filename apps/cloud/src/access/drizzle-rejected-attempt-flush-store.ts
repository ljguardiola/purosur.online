import type {
  FlushedRejectedAttempts,
  RejectedAttemptFlushStore,
  RejectedAttemptFlushStoreTransaction,
  RejectedAttemptWindow,
} from "@purosur/domain/credentials/use-cases";
import { and, asc, inArray, lte, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../platform/db/schema.js";

const FLUSH_LOCK_KEY = "recovery-rejected-attempt-flush";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

// Must hash exactly as `hashDestinationAddress` does, or a stored address never matches its key.
const destinationAddressHash = sql<string>`encode(sha256(convert_to(${users.email}, 'UTF8')), 'hex')`;

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return chunks;
}

function toWindow(
  row: typeof recoveryRejectedAttemptAccumulator.$inferSelect,
): RejectedAttemptWindow {
  return {
    kind: row.kind,
    keyHash: row.keyHash,
    windowStart: row.windowStart,
    count: row.count,
    firstAt: row.firstAt,
    lastAt: row.lastAt,
  };
}

class DrizzleRejectedAttemptFlushStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RejectedAttemptFlushStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly chunkSize: number;

  constructor(tx: Transaction<TQueryResult>, chunkSize: number) {
    this.tx = tx;
    this.chunkSize = chunkSize;
  }

  async lockFlush(): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${FLUSH_LOCK_KEY}, 0))`,
    );
  }

  async takeClosedWindows(closedBefore: Date, limit: number): Promise<RejectedAttemptWindow[]> {
    const taken = await this.tx
      .delete(recoveryRejectedAttemptAccumulator)
      .where(
        inArray(
          recoveryRejectedAttemptAccumulator.id,
          this.tx
            .select({ id: recoveryRejectedAttemptAccumulator.id })
            .from(recoveryRejectedAttemptAccumulator)
            .where(lte(recoveryRejectedAttemptAccumulator.windowStart, closedBefore))
            .orderBy(
              asc(recoveryRejectedAttemptAccumulator.windowStart),
              asc(recoveryRejectedAttemptAccumulator.id),
            )
            .limit(limit),
        ),
      )
      .returning();
    return taken.map(toWindow);
  }

  async accountsByDestinationHash(keyHashes: string[]): Promise<Map<string, string>> {
    const accountByHash = new Map<string, string>();
    for (const hashes of chunk(keyHashes, this.chunkSize)) {
      const accounts = await this.tx
        .select({ id: users.id, hash: destinationAddressHash })
        .from(users)
        .where(inArray(destinationAddressHash, hashes));
      for (const account of accounts) {
        accountByHash.set(account.hash, account.id);
      }
    }
    return accountByHash;
  }

  async accountsByTokenHash(keyHashes: string[]): Promise<Map<string, string>> {
    const accountByHash = new Map<string, string>();
    for (const hashes of chunk(keyHashes, this.chunkSize)) {
      const tokens = await this.tx
        .select({ tokenHash: recoveryTokens.tokenHash, userId: recoveryTokens.userId })
        .from(recoveryTokens)
        .where(inArray(recoveryTokens.tokenHash, hashes));
      for (const token of tokens) {
        accountByHash.set(token.tokenHash, token.userId);
      }
    }
    return accountByHash;
  }

  async takeClosedTokenWindowsOf(
    accountIds: string[],
    closedBefore: Date,
  ): Promise<RejectedAttemptWindow[]> {
    const taken: RejectedAttemptWindow[] = [];
    for (const ids of chunk(accountIds, this.chunkSize)) {
      const deleted = await this.tx
        .delete(recoveryRejectedAttemptAccumulator)
        .where(
          and(
            lte(recoveryRejectedAttemptAccumulator.windowStart, closedBefore),
            ne(recoveryRejectedAttemptAccumulator.kind, "request"),
            inArray(
              recoveryRejectedAttemptAccumulator.keyHash,
              this.tx
                .select({ tokenHash: recoveryTokens.tokenHash })
                .from(recoveryTokens)
                .where(inArray(recoveryTokens.userId, ids)),
            ),
          ),
        )
        .returning();
      taken.push(...deleted.map(toWindow));
    }
    return taken;
  }

  async recordFlushedAttempts(flushed: FlushedRejectedAttempts[]): Promise<void> {
    for (const group of chunk(flushed, this.chunkSize)) {
      await this.tx.insert(auditLog).values(
        group.map((attempts) => ({
          entity: "user",
          entityId: attempts.accountId,
          actorId: attempts.accountId,
          previousValue: null,
          newValue: {
            attempt: attempts.kind,
            rejectedWith: "rate_limited",
            count: attempts.count,
            firstAt: attempts.firstAt.toISOString(),
            lastAt: attempts.lastAt.toISOString(),
          },
          at: attempts.lastAt,
        })),
      );
    }
  }
}

export class DrizzleRejectedAttemptFlushStore<TQueryResult extends PgQueryResultHKT>
  implements RejectedAttemptFlushStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly chunkSize: number;

  constructor(db: PgDatabase<TQueryResult>, chunkSize: number) {
    this.db = db;
    this.chunkSize = chunkSize;
  }

  transaction<TOutcome>(
    work: (tx: RejectedAttemptFlushStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleRejectedAttemptFlushStoreTransaction(tx, this.chunkSize)),
    );
  }
}
