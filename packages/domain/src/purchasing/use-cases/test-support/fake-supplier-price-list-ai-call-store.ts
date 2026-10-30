import type { AiCallRecord } from "../ai-call-recording.js";
import type { SupplierPriceListAiCallStore } from "../supplier-price-list-ai-call-store.js";

export class FakeSupplierPriceListAiCallStore implements SupplierPriceListAiCallStore {
  readonly recorded: AiCallRecord[] = [];
  recordings = 0;
  failure: Error | null = null;

  async record(records: AiCallRecord[]): Promise<void> {
    this.recordings += 1;
    if (this.failure !== null) {
      throw this.failure;
    }
    this.recorded.push(...records.map((record) => ({ ...record })));
  }
}
