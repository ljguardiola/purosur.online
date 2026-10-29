import type { RemovalFacts } from "../../model/removed-lines-and-cancelled-sales-report.js";
import type {
  RemovedLinesAndCancelledSalesQuery,
  RemovedLinesAndCancelledSalesReportReader,
} from "../removed-lines-and-cancelled-sales-report-reader.js";

export class FakeRemovedLinesAndCancelledSalesReportReader
  implements RemovedLinesAndCancelledSalesReportReader
{
  readonly reads: RemovedLinesAndCancelledSalesQuery[] = [];
  private readonly facts: RemovalFacts;

  constructor(facts: RemovalFacts = { removedLines: [], cancelledSales: [] }) {
    this.facts = facts;
  }

  async removalFacts(query: RemovedLinesAndCancelledSalesQuery): Promise<RemovalFacts> {
    this.reads.push({ ...query, range: { ...query.range } });
    return {
      removedLines: this.facts.removedLines.map((group) => ({ ...group })),
      cancelledSales: this.facts.cancelledSales.map((sale) => ({ ...sale })),
    };
  }
}
