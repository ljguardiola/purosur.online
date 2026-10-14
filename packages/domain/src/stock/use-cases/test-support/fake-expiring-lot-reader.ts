import type {
  ExpiringLotReader,
  ExpiringLotRow,
  ExpiryWarningWindowReader,
} from "../expiring-lot-reader.js";

export class FakeExpiringLotReader implements ExpiringLotReader {
  readonly lotReads: { locationId: string; lastDay: string }[] = [];
  private readonly rows: (ExpiringLotRow & { locationId: string })[];

  constructor(rows: (ExpiringLotRow & { locationId: string })[]) {
    this.rows = rows;
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

export class FakeBranchSettings implements ExpiryWarningWindowReader {
  readonly reads: string[] = [];
  private readonly expiringLotAlertDays: number;

  constructor(expiringLotAlertDays: number) {
    this.expiringLotAlertDays = expiringLotAlertDays;
  }

  async currentBranchSettings(locationId: string): Promise<{ expiringLotAlertDays: number }> {
    this.reads.push(locationId);
    return { expiringLotAlertDays: this.expiringLotAlertDays };
  }
}
