import type { ExpiringLotReader, ExpiringLotRow } from "../expiring-lot-reader.js";

export class FakeExpiringLotReader implements ExpiringLotReader {
  readonly windowReads: string[] = [];
  readonly lotReads: { locationId: string; lastDay: string }[] = [];
  private readonly windowDays: number;
  private readonly rows: (ExpiringLotRow & { locationId: string })[];

  constructor(windowDays: number, rows: (ExpiringLotRow & { locationId: string })[]) {
    this.windowDays = windowDays;
    this.rows = rows;
  }

  async expiryWarningWindowDays(locationId: string): Promise<number> {
    this.windowReads.push(locationId);
    return this.windowDays;
  }

  async lotsExpiringBy(locationId: string, lastDay: string): Promise<ExpiringLotRow[]> {
    this.lotReads.push({ locationId, lastDay });
    return this.rows
      .filter(
        (row) =>
          row.locationId === locationId && (row.expiresOn === null || row.expiresOn <= lastDay),
      )
      .map(({ locationId: _, ...row }) => ({ ...row, product: { ...row.product } }));
  }
}
