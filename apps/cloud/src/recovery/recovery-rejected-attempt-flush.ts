import { inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";

const WINDOW_MS = 60 * 60 * 1000;

export interface FlushRecoveryRejectedAttemptWindowsDeps {
  now: () => Date;
}

interface AccumulatorRow {
  id: string;
  kind: "request" | "registration_options" | "redeem";
  keyHash: string;
  windowStart: Date;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

interface FlushedGroup {
  accountId: string;
  kind: AccumulatorRow["kind"];
  count: number;
  firstAt: Date;
  lastAt: Date;
}

function resolveAccountId(
  row: AccumulatorRow,
  accountByDestinationHash: Map<string, string>,
  accountByTokenHash: Map<string, string>,
): string | undefined {
  return row.kind === "request"
    ? accountByDestinationHash.get(row.keyHash)
    : accountByTokenHash.get(row.keyHash);
}

/**
 * The graphile-worker cron task body for issue #167's grouped audit of rate-limited rejections
 * (H1): resolves every CLOSED window's accumulator rows to the account each key belongs to —
 * `request`'s destination-address hash to the account whose own normalized email hashes the same
 * way, `registration_options`/`redeem`'s token hash to `recovery_tokens.user_id` — merges every
 * row of the same account, kind and window into one audit_log row (several tokens of the same
 * account in the same window collapse into that one row's count), and deletes every flushed
 * accumulator row in the same transaction. A key that resolves to no account is dropped: nothing
 * to attribute it to. `FOR UPDATE SKIP LOCKED` makes two overlapping flushes safe: each only ever
 * locks the closed rows the other isn't already working on, so neither can double-count or
 * double-write the same row.
 */
export async function flushClosedRecoveryRejectedAttemptWindows<
  TQueryResult extends PgQueryResultHKT,
>(db: PgDatabase<TQueryResult>, deps: FlushRecoveryRejectedAttemptWindowsDeps): Promise<number> {
  const closedBefore = new Date(deps.now().getTime() - WINDOW_MS);

  return db.transaction(async (tx) => {
    const closedRows = (await tx
      .select()
      .from(recoveryRejectedAttemptAccumulator)
      .where(lte(recoveryRejectedAttemptAccumulator.windowStart, closedBefore))
      .for("update", { skipLocked: true })) as AccumulatorRow[];

    if (closedRows.length === 0) {
      return 0;
    }

    const requestKeyHashes = new Set(
      closedRows.filter((row) => row.kind === "request").map((row) => row.keyHash),
    );
    const tokenKeyHashes = [
      ...new Set(closedRows.filter((row) => row.kind !== "request").map((row) => row.keyHash)),
    ];

    const accountByDestinationHash = new Map<string, string>();
    if (requestKeyHashes.size > 0) {
      const accounts = await tx.select({ id: users.id, email: users.email }).from(users);
      for (const account of accounts) {
        accountByDestinationHash.set(hashDestinationAddress(account.email), account.id);
      }
    }

    const accountByTokenHash = new Map<string, string>();
    if (tokenKeyHashes.length > 0) {
      const tokens = await tx
        .select({ tokenHash: recoveryTokens.tokenHash, userId: recoveryTokens.userId })
        .from(recoveryTokens)
        .where(inArray(recoveryTokens.tokenHash, tokenKeyHashes));
      for (const token of tokens) {
        accountByTokenHash.set(token.tokenHash, token.userId);
      }
    }

    const groups = new Map<string, FlushedGroup>();
    for (const row of closedRows) {
      const accountId = resolveAccountId(row, accountByDestinationHash, accountByTokenHash);
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

    if (groups.size > 0) {
      await tx.insert(auditLog).values(
        [...groups.values()].map((group) => ({
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

    await tx.delete(recoveryRejectedAttemptAccumulator).where(
      inArray(
        recoveryRejectedAttemptAccumulator.id,
        closedRows.map((row) => row.id),
      ),
    );

    return closedRows.length;
  });
}
