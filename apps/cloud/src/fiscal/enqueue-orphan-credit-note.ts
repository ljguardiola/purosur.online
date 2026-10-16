import type { SqlExecutor } from "./enqueue-unclear-outcome.js";

export type EnqueueOrphanCreditNote = (
  transaction: SqlExecutor,
  creditNoteId: string,
) => Promise<void>;
