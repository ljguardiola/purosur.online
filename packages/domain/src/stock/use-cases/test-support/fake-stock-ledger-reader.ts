import type { LedgerAtMoment, StockLedgerReader, StockProduct } from "../stock-reader.js";
import type { ProductStockKey } from "../stock-store.js";

export interface LedgerRead {
  key: ProductStockKey;
  at: Date;
}

export class FakeStockLedgerReader implements StockLedgerReader {
  private readonly products: StockProduct[];
  private readonly ledger: LedgerAtMoment;

  readonly ledgerReads: LedgerRead[] = [];

  constructor(
    products: StockProduct[],
    ledger: Pick<LedgerAtMoment, "balance" | "appliedAfterCount"> &
      Partial<Pick<LedgerAtMoment, "lots" | "lotAllocationsAfter">>,
  ) {
    this.products = products;
    this.ledger = { lots: [], lotAllocationsAfter: new Map(), ...ledger };
  }

  async product(productId: string): Promise<StockProduct | undefined> {
    return this.products.find((product) => product.id === productId);
  }

  async ledgerAt(key: ProductStockKey, at: Date): Promise<LedgerAtMoment> {
    this.ledgerReads.push({ key: { ...key }, at: new Date(at) });
    return { ...this.ledger, lots: this.ledger.lots.map((lot) => ({ ...lot })) };
  }
}
