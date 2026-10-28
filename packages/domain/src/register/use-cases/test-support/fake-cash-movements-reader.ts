import type { ReportedCashMovement } from "../../model/cash-movements-report.js";
import type {
  CashMovementsQuery,
  CashMovementsReportReader,
} from "../cash-movements-report-reader.js";

export class FakeCashMovementsReader implements CashMovementsReportReader {
  readonly reads: CashMovementsQuery[] = [];
  private readonly movements: ReportedCashMovement[];

  constructor(movements: ReportedCashMovement[] = []) {
    this.movements = movements;
  }

  async reportedCashMovements(query: CashMovementsQuery): Promise<ReportedCashMovement[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.movements.map((movement) => ({ ...movement }));
  }
}
