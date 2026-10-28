import type { WeighedLinesGroup } from "../../model/hand-typed-weights-report.js";
import type {
  HandTypedWeightsQuery,
  HandTypedWeightsReportReader,
} from "../hand-typed-weights-report-reader.js";

export class FakeHandTypedWeightsReportReader implements HandTypedWeightsReportReader {
  readonly reads: HandTypedWeightsQuery[] = [];
  private readonly groups: WeighedLinesGroup[];

  constructor(groups: WeighedLinesGroup[] = []) {
    this.groups = groups;
  }

  async weighedLinesOfCompletedSales(query: HandTypedWeightsQuery): Promise<WeighedLinesGroup[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.groups.map((group) => ({ ...group }));
  }
}
