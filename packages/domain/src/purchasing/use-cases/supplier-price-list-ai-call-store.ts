import type { AiCallRecord } from "./ai-call-recording.js";

export interface SupplierPriceListAiCallStore {
  // Records every call of the operation in one transaction.
  record(records: AiCallRecord[]): Promise<void>;
}
