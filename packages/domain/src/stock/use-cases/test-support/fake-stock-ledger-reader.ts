import type {
  LedgerAtMoment,
  LotInStock,
  StockLedgerReader,
  StockProduct,
} from "../stock-reader.js";
import type { ProductStockKey } from "../stock-store.js";

export interface LedgerRead {
  key: ProductStockKey;
  at: Date;
}

export class FakeStockLedgerReader implements StockLedgerReader {
  private readonly products: StockProduct[];
  private readonly ledger: LedgerAtMoment;

  private readonly lots: LotInStock[];

  readonly ledgerReads: LedgerRead[] = [];
  readonly lotReads: ProductStockKey[] = [];

  constructor(products: StockProduct[], ledger: LedgerAtMoment, lots: LotInStock[] = []) {
    this.products = products;
    this.ledger = ledger;
    this.lots = lots;
  }

  async product(productId: string): Promise<StockProduct | undefined> {
    return this.products.find((product) => product.id === productId);
  }

  async ledgerAt(key: ProductStockKey, at: Date): Promise<LedgerAtMoment> {
    this.ledgerReads.push({ key: { ...key }, at: new Date(at) });
    return { ...this.ledger };
  }

  async lotsInStock(key: ProductStockKey): Promise<LotInStock[]> {
    this.lotReads.push({ ...key });
    return this.lots.map((lot) => ({ ...lot }));
  }
}
