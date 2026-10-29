import type { SaleLinesGroup } from "../../model/hand-typed-weights-report.js";
import type {
  HandTypedWeightsQuery,
  HandTypedWeightsReportReader,
} from "../hand-typed-weights-report-reader.js";

export class FakeHandTypedWeightsReportReader implements HandTypedWeightsReportReader {
  readonly reads: HandTypedWeightsQuery[] = [];
  private readonly groups: SaleLinesGroup[];

  constructor(groups: SaleLinesGroup[] = []) {
    this.groups = groups;
  }

  async completedSaleLinesByWeightSource(query: HandTypedWeightsQuery): Promise<SaleLinesGroup[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.groups.map((group) => ({ ...group }));
  }
}
