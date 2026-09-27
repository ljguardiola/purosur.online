import { and, asc, inArray, lte, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../platform/db/schema.js";
import { RECOVERY_WINDOW_MS } from "./recovery-rate-limiter.js";
import type { RecoveryRejectedAttemptKind } from "./recovery-rejected-attempt-accumulator.js";

// Lets a rejection sampled just before the hour ends finish upserting before the flush deletes
// its row.
const CLOSE_GRACE_MS = 10 * 60 * 1000;
// Bounds one batch's rows and the parameters one statement binds; a batch can still exceed this
// by carrying an account's other closed rows along.
const FLUSH_BATCH_SIZE = 500;
const FLUSH_LOCK_KEY = "recovery-rejected-attempt-flush";

export interface FlushRecoveryRejectedAttemptWindowsDeps {
  now: () => Date;
  batchSize?: number;
}

type AccumulatorRow = typeof recoveryRejectedAttemptAccumulator.$inferSelect;

interface FlushedGroup {
  accountId: string;
  kind: RecoveryRejectedAttemptKind;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

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

async function loadAccountsByDestinationHash<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  keyHashes: string[],
  batchSize: number,
): Promise<Map<string, string>> {
  const accountByHash = new Map<string, string>();
  for (const hashes of chunk(keyHashes, batchSize)) {
    const accounts = await tx
      .select({ id: users.id, hash: destinationAddressHash })
      .from(users)
      .where(inArray(destinationAddressHash, hashes));
    for (const account of accounts) {
      accountByHash.set(account.hash, account.id);
    }
  }
  return accountByHash;
}

async function resolveTokenHashes<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  keyHashes: string[],
  batchSize: number,
): Promise<Map<string, string>> {
  const accountByHash = new Map<string, string>();
  for (const hashes of chunk(keyHashes, batchSize)) {
    const tokens = await tx
      .select({ tokenHash: recoveryTokens.tokenHash, userId: recoveryTokens.userId })
      .from(recoveryTokens)
      .where(inArray(recoveryTokens.tokenHash, hashes));
    for (const token of tokens) {
      accountByHash.set(token.tokenHash, token.userId);
    }
  }
  return accountByHash;
}

function groupByAccount(
  rows: AccumulatorRow[],
  accountByDestinationHash: Map<string, string>,
  accountByTokenHash: Map<string, string>,
): FlushedGroup[] {
  const groups = new Map<string, FlushedGroup>();
  for (const row of rows) {
    const accountId =
      row.kind === "request"
        ? accountByDestinationHash.get(row.keyHash)
        : accountByTokenHash.get(row.keyHash);
    if (!accountId) {
      continue;
    }
    const groupKey = `${row.kind}:${accountId}:${row.windowStart.toISOString()}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.count += row.count;
      if (row.firstAt < existing.firstAt) {
        existing.firstAt = row.firstAt;
      }
      if (row.lastAt > existing.lastAt) {
        existing.lastAt = row.lastAt;
      }
    } else {
      groups.set(groupKey, {
        accountId,
        kind: row.kind,
        count: row.count,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
      });
    }
  }
  return [...groups.values()];
}

async function flushOneBatch<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  closedBefore: Date,
  batchSize: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    // One flush at a time, so one account/kind/window is never split across two audit rows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${FLUSH_LOCK_KEY}, 0))`);

    const closed = lte(recoveryRejectedAttemptAccumulator.windowStart, closedBefore);
    const batch = await tx
      .delete(recoveryRejectedAttemptAccumulator)
      .where(
        inArray(
          recoveryRejectedAttemptAccumulator.id,
          tx
            .select({ id: recoveryRejectedAttemptAccumulator.id })
            .from(recoveryRejectedAttemptAccumulator)
            .where(closed)
            .orderBy(
              asc(recoveryRejectedAttemptAccumulator.windowStart),
              asc(recoveryRejectedAttemptAccumulator.id),
            )
            .limit(batchSize),
        ),
      )
      .returning();
    if (batch.length === 0) {
      return 0;
    }

    const requestKeyHashes = batch
      .filter((row) => row.kind === "request")
      .map((row) => row.keyHash);
    const accountByDestinationHash = await loadAccountsByDestinationHash(
      tx,
      requestKeyHashes,
      batchSize,
    );
    const accountByTokenHash = await resolveTokenHashes(
      tx,
      batch.filter((row) => row.kind !== "request").map((row) => row.keyHash),
      batchSize,
    );

    // An account can hold several tokens, so its other closed token-kind rows are taken along too,
    // to keep the batch boundary from splitting one account's window across two audit rows.
    const tokenAccountIds = [...new Set(accountByTokenHash.values())];
    const siblings: AccumulatorRow[] = [];
    for (const accountIds of chunk(tokenAccountIds, batchSize)) {
      const deleted = await tx
        .delete(recoveryRejectedAttemptAccumulator)
        .where(
          and(
            closed,
            ne(recoveryRejectedAttemptAccumulator.kind, "request"),
            inArray(
              recoveryRejectedAttemptAccumulator.keyHash,
              tx
                .select({ tokenHash: recoveryTokens.tokenHash })
                .from(recoveryTokens)
                .where(inArray(recoveryTokens.userId, accountIds)),
            ),
          ),
        )
        .returning();
      siblings.push(...deleted);
    }
    const siblingAccounts = await resolveTokenHashes(
      tx,
      siblings.map((row) => row.keyHash),
      batchSize,
    );
    for (const [tokenHash, accountId] of siblingAccounts) {
      accountByTokenHash.set(tokenHash, accountId);
    }

    const groups = groupByAccount(
      [...batch, ...siblings],
      accountByDestinationHash,
      accountByTokenHash,
    );
    for (const groupsChunk of chunk(groups, batchSize)) {
      await tx.insert(auditLog).values(
        groupsChunk.map((group) => ({
          entity: "user",
          entityId: group.accountId,
          actorId: group.accountId,
          previousValue: null,
          newValue: {
            attempt: group.kind,
            rejectedWith: "rate_limited",
            count: group.count,
            firstAt: group.firstAt.toISOString(),
            lastAt: group.lastAt.toISOString(),
          },
          at: group.lastAt,
        })),
      );
    }

    return batch.length + siblings.length;
  });
}

export async function flushClosedRecoveryRejectedAttemptWindows<
  TQueryResult extends PgQueryResultHKT,
>(db: PgDatabase<TQueryResult>, deps: FlushRecoveryRejectedAttemptWindowsDeps): Promise<number> {
  const closedBefore = new Date(deps.now().getTime() - RECOVERY_WINDOW_MS - CLOSE_GRACE_MS);
  const batchSize = deps.batchSize ?? FLUSH_BATCH_SIZE;

  let flushed = 0;
  for (;;) {
    const flushedInBatch = await flushOneBatch(db, closedBefore, batchSize);
    if (flushedInBatch === 0) {
      return flushed;
    }
    flushed += flushedInBatch;
  }
}
