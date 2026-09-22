import { and, asc, inArray, lte, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { RECOVERY_WINDOW_MS } from "./recovery-rate-limiter.js";
import type { RecoveryRejectedAttemptKind } from "./recovery-rejected-attempt-accumulator.js";

// A rejection sampled just before the hour ends can still be upserting its row a moment after;
// waiting this long past the hour means the window is flushed only once nothing lands in it any
// more, instead of a late upsert re-creating a row the flush already deleted.
const CLOSE_GRACE_MS = 10 * 60 * 1000;
// Bounds the rows one batch selects and the parameters any one statement binds, since the number of
// keys a flood can create is chosen by whoever sends it. A transaction also takes along every other
// closed token-kind row of the accounts its batch resolved, so it can hold more rows than this: at
// most one per kind, closed window and token of those accounts. Only a token some recovery link
// actually carried matches one, so made-up keys never add to that number.
const FLUSH_BATCH_SIZE = 500;
const FLUSH_LOCK_KEY = "recovery-rejected-attempt-flush";

export interface FlushRecoveryRejectedAttemptWindowsDeps {
  now: () => Date;
  /** Injected in tests to split a handful of rows across several batches. */
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

// Must hash exactly as `hashDestinationAddress` does: SHA-256 of the stored address's UTF-8 bytes,
// hex-encoded. The stored address is already the normalized form the request route hashes.
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
): Promise<Map<string, string>> {
  const accounts = await tx.select({ id: users.id, hash: destinationAddressHash }).from(users);
  return new Map(accounts.map((account) => [account.hash, account.id]));
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
    // One flush at a time: every row of one account, kind and window is merged by the same
    // transaction, never split between two overlapping flushes that would each write a row.
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

    const accountByDestinationHash = batch.some((row) => row.kind === "request")
      ? await loadAccountsByDestinationHash(tx)
      : new Map<string, string>();
    const accountByTokenHash = await resolveTokenHashes(
      tx,
      batch.filter((row) => row.kind !== "request").map((row) => row.keyHash),
      batchSize,
    );

    // An account's address hashes to a single request-kind key, but it can hold several tokens:
    // take every other closed row of those accounts' tokens along, so the batch boundary never
    // splits one account's window across two audit rows.
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

/**
 * The graphile-worker cron task body for issue #167's grouped audit of rate-limited rejections:
 * resolves every CLOSED window's accumulator rows to the account each key belongs to —
 * `request`'s destination-address hash to the account whose own normalized email hashes the same
 * way, `registration_options`/`redeem`'s token hash to `recovery_tokens.user_id` — merges every
 * row of the same account, kind and window into one audit_log row (several tokens of the same
 * account in the same window collapse into that one row's count), and deletes every flushed
 * accumulator row in the same transaction. A key that resolves to no account is dropped: nothing
 * to attribute it to. Closed rows are taken in bounded batches, one transaction each, until none
 * is left.
 */
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
