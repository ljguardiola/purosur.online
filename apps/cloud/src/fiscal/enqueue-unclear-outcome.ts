import type { SQL } from "drizzle-orm";

export interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueUnclearOutcome = (
  transaction: SqlExecutor,
  fiscalDocumentId: string,
  runAt: Date,
) => Promise<void>;

export type WithdrawUnclearOutcome = (
  transaction: SqlExecutor,
  fiscalDocumentId: string,
) => Promise<void>;
