import type {
  FlushedRejectedAttempts,
  RejectedAttemptFlushStore,
  RejectedAttemptWindow,
} from "./rejected-attempt-flush-store.js";

export interface FlushRejectedAttemptsPorts {
  store: RejectedAttemptFlushStore;
}

export interface FlushRejectedAttemptsInput {
  closedBefore: Date;
  batchSize: number;
}

function groupByAccount(
  windows: RejectedAttemptWindow[],
  accountByDestinationHash: Map<string, string>,
  accountByTokenHash: Map<string, string>,
): FlushedRejectedAttempts[] {
  const groups = new Map<string, FlushedRejectedAttempts>();
  for (const window of windows) {
    const accountId =
      window.kind === "request"
        ? accountByDestinationHash.get(window.keyHash)
        : accountByTokenHash.get(window.keyHash);
    if (!accountId) {
      continue;
    }
    const groupKey = `${window.kind}:${accountId}:${window.windowStart.toISOString()}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.count += window.count;
      existing.firstAt = new Date(Math.min(existing.firstAt.getTime(), window.firstAt.getTime()));
      existing.lastAt = new Date(Math.max(existing.lastAt.getTime(), window.lastAt.getTime()));
    } else {
      groups.set(groupKey, {
        accountId,
        kind: window.kind,
        count: window.count,
        firstAt: window.firstAt,
        lastAt: window.lastAt,
      });
    }
  }
  return [...groups.values()];
}

async function flushOneBatch(
  store: RejectedAttemptFlushStore,
  { closedBefore, batchSize }: FlushRejectedAttemptsInput,
): Promise<number> {
  return store.transaction(async (tx) => {
    await tx.lockFlush();

    const batch = await tx.takeClosedWindows(closedBefore, batchSize);

    const accountByDestinationHash = await tx.accountsByDestinationHash(
      batch.filter((window) => window.kind === "request").map((window) => window.keyHash),
    );
    const accountByTokenHash = await tx.accountsByTokenHash(
      batch.filter((window) => window.kind !== "request").map((window) => window.keyHash),
    );

    // An account can hold several tokens, so its other closed token-kind windows are taken along
    // too, to keep the batch boundary from splitting one account's window across two audit rows.
    const siblings = await tx.takeClosedTokenWindowsOf(
      [...new Set(accountByTokenHash.values())],
      closedBefore,
    );
    const siblingAccounts = await tx.accountsByTokenHash(siblings.map((window) => window.keyHash));
    for (const [tokenHash, accountId] of siblingAccounts) {
      accountByTokenHash.set(tokenHash, accountId);
    }

    await tx.recordFlushedAttempts(
      groupByAccount([...batch, ...siblings], accountByDestinationHash, accountByTokenHash),
    );
    return batch.length + siblings.length;
  });
}

export async function flushRejectedAttempts(
  { store }: FlushRejectedAttemptsPorts,
  input: FlushRejectedAttemptsInput,
): Promise<number> {
  let flushed = 0;
  for (;;) {
    const flushedInBatch = await flushOneBatch(store, input);
    if (flushedInBatch === 0) {
      return flushed;
    }
    flushed += flushedInBatch;
  }
}
