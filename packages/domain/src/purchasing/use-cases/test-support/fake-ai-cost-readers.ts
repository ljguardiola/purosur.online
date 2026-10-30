import type { PricedAiCall, RecordedAiCall } from "../../model/ai-cost-report.js";
import type { AiCostReportQuery, AiCostReportReader } from "../ai-cost-report-reader.js";
import type {
  SupplierPriceListAiCostQuery,
  SupplierPriceListAiCostReader,
} from "../supplier-price-list-ai-cost-reader.js";

export class FakeSupplierPriceListAiCostReader implements SupplierPriceListAiCostReader {
  readonly reads: SupplierPriceListAiCostQuery[] = [];
  private readonly lists: ReadonlyMap<string, { locationId: string; calls: PricedAiCall[] }>;

  constructor(lists: Record<string, { locationId: string; calls: PricedAiCall[] }> = {}) {
    this.lists = new Map(Object.entries(lists));
  }

  async callsOfList(query: SupplierPriceListAiCostQuery): Promise<PricedAiCall[] | undefined> {
    this.reads.push({ ...query });
    const list = this.lists.get(query.listId);
    return list?.locationId === query.locationId
      ? list.calls.map((call) => ({ ...call }))
      : undefined;
  }
}

export class FakeAiCostReportReader implements AiCostReportReader {
  readonly reads: AiCostReportQuery[] = [];
  private readonly calls: readonly RecordedAiCall[];

  constructor(calls: readonly RecordedAiCall[] = []) {
    this.calls = calls;
  }

  async recordedCalls(query: AiCostReportQuery): Promise<RecordedAiCall[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.calls.map((call) => ({ ...call }));
  }
}
