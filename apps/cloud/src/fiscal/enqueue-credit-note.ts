import type { SqlExecutor } from "./enqueue-unclear-outcome.js";

export type EnqueueCreditNote = (transaction: SqlExecutor, creditNoteId: string) => Promise<void>;
