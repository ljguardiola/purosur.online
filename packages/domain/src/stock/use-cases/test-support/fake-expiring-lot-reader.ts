import type { LotNameFacts } from "../../model/lot-name.js";
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

export class FakeExpiryWarningWindowReader implements ExpiryWarningWindowReader {
  readonly reads: string[] = [];
  private readonly windowDays: number;

  constructor(windowDays: number) {
    this.windowDays = windowDays;
  }

  async expiryWarningWindowDays(locationId: string): Promise<number> {
    this.reads.push(locationId);
    return this.windowDays;
  }
}

export function technicalLotFactsOfRows(
  rows: readonly (ExpiringLotRow & { locationId: string })[],
): LotNameFacts[] {
  return rows.map((row, index) => ({
    lotId: row.id,
    productId: row.product.id,
    locationId: row.locationId,
    nameOrder: index + 1,
    givenNumber: null,
    origin: { kind: "technical", openedAt: new Date("2026-10-01T15:00:00.000Z") },
  }));
}
