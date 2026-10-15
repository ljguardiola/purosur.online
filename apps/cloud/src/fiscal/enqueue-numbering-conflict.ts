import type { SqlExecutor } from "./enqueue-unclear-outcome.js";

export type EnqueueNumberingDiagnosis = (
  transaction: SqlExecutor,
  fiscalDocumentId: string,
) => Promise<void>;

export type EnqueueNumberingReconciliation = (
  transaction: SqlExecutor,
  pointOfSale: number,
) => Promise<void>;
