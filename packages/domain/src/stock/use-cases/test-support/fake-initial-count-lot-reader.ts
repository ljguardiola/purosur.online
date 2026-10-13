import type {
  InitialCountLotReader,
  InitialCountLotRow,
  InitialCountLotsQuery,
} from "../initial-count-lot-reader.js";

export class FakeInitialCountLotReader implements InitialCountLotReader {
  readonly queries: InitialCountLotsQuery[] = [];
  private readonly rows: (InitialCountLotRow & { locationId: string })[];

  constructor(rows: (InitialCountLotRow & { locationId: string })[]) {
    this.rows = rows;
  }

  async notWithdrawnInitialCountLots(query: InitialCountLotsQuery): Promise<InitialCountLotRow[]> {
    this.queries.push(query);
    const text = query.productName?.toLowerCase();
    return this.rows
      .filter(
        (row) =>
          row.locationId === query.locationId &&
          (query.costIncomplete === undefined || row.costIncomplete === query.costIncomplete) &&
          (text === undefined || row.productName.toLowerCase().includes(text)),
      )
      .map(({ locationId: _, ...row }) => row);
  }
}
