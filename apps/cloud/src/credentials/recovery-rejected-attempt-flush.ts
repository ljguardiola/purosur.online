import { RECOVERY_RATE_LIMIT_WINDOW_MS } from "@purosur/domain";
import { flushRejectedAttempts } from "@purosur/domain/credentials/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleRejectedAttemptFlushStore } from "./drizzle-rejected-attempt-flush-store.js";

// Lets a rejection sampled just before the hour ends finish upserting before the flush deletes
// its row.
const CLOSE_GRACE_MS = 10 * 60 * 1000;
// Bounds one batch's rows and the parameters one statement binds; a batch can still exceed this
// by carrying an account's other closed rows along.
const FLUSH_BATCH_SIZE = 500;

export interface FlushRecoveryRejectedAttemptWindowsDeps {
  now: () => Date;
  batchSize?: number;
}

export function flushClosedRecoveryRejectedAttemptWindows<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: FlushRecoveryRejectedAttemptWindowsDeps,
): Promise<number> {
  const batchSize = deps.batchSize ?? FLUSH_BATCH_SIZE;
  return flushRejectedAttempts(
    { store: new DrizzleRejectedAttemptFlushStore(db, batchSize) },
    {
      closedBefore: new Date(deps.now().getTime() - RECOVERY_RATE_LIMIT_WINDOW_MS - CLOSE_GRACE_MS),
      batchSize,
    },
  );
}
