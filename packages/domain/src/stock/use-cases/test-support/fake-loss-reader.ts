import type { LossRecord } from "../../model/losses-by-reason.js";
import type { LossQuery, LossReader } from "../loss-reader.js";

export class FakeLossReader implements LossReader {
  readonly reads: LossQuery[] = [];

  private readonly records: readonly LossRecord[];

  constructor(records: readonly LossRecord[] = []) {
    this.records = records;
  }

  async lossesRecorded(query: LossQuery): Promise<LossRecord[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.records.map((record) => ({ ...record, product: { ...record.product } }));
  }
}
