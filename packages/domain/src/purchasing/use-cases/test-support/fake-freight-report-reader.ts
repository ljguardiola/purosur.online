import type { RegisteredFreight } from "../../model/freight-by-period-report.js";
import type { FreightReportQuery, FreightReportReader } from "../freight-report-reader.js";

export class FakeFreightReportReader implements FreightReportReader {
  readonly reads: FreightReportQuery[] = [];
  private readonly freights: readonly RegisteredFreight[];

  constructor(freights: readonly RegisteredFreight[] = []) {
    this.freights = freights;
  }

  async registeredFreights(query: FreightReportQuery): Promise<RegisteredFreight[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.freights.map((freight) => ({ ...freight }));
  }
}
