import type { RecordedAiCall } from "../../model/ai-cost-report.js";
import type { AiCostReportQuery, AiCostReportReader } from "../ai-cost-report-reader.js";
import type {
  SupplierPriceListAiCalls,
  SupplierPriceListAiCostReader,
} from "../supplier-price-list-ai-cost-reader.js";

export class FakeSupplierPriceListAiCostReader implements SupplierPriceListAiCostReader {
  readonly reads: string[] = [];
  private readonly lists: ReadonlyMap<string, SupplierPriceListAiCalls>;

  constructor(lists: Record<string, SupplierPriceListAiCalls> = {}) {
    this.lists = new Map(Object.entries(lists));
  }

  async callsOfList(listId: string): Promise<SupplierPriceListAiCalls | undefined> {
    this.reads.push(listId);
    const list = this.lists.get(listId);
    return list === undefined
      ? undefined
      : { ...list, calls: list.calls.map((call) => ({ ...call })) };
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
