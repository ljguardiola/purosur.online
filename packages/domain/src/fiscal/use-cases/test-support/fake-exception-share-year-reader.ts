import type {
  ExceptionShareFiscalAddress,
  ExceptionShareYearQuery,
  ExceptionShareYearReader,
  MonthlyVoucherCounts,
} from "../read-exception-share-year-ports.js";

export class FakeExceptionShareYearReader implements ExceptionShareYearReader {
  readonly queries: ExceptionShareYearQuery[] = [];

  constructor(
    private readonly fiscalAddresses: readonly ExceptionShareFiscalAddress[],
    private readonly counts: readonly MonthlyVoucherCounts[] = [],
    private readonly recordedMonths: readonly string[] = [],
  ) {}

  async fiscalAddress(fiscalAddressId: string): Promise<ExceptionShareFiscalAddress | undefined> {
    return this.fiscalAddresses.find((each) => each.id === fiscalAddressId);
  }

  async monthlyVoucherCounts(query: ExceptionShareYearQuery): Promise<MonthlyVoucherCounts[]> {
    this.queries.push({ ...query });
    return structuredClone([...this.counts]);
  }

  async recordedBreachMonths(query: ExceptionShareYearQuery): Promise<string[]> {
    this.queries.push({ ...query });
    return [...this.recordedMonths];
  }
}
