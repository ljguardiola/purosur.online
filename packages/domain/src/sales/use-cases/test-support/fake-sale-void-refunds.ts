import type { SaleVoidRefund, SaleVoidRefunds } from "../sale-void-refunds.js";

export class FakeSaleVoidRefunds implements SaleVoidRefunds {
  readonly asked: string[] = [];
  private readonly bySale: Map<string, SaleVoidRefund[]>;

  constructor(bySale: Record<string, SaleVoidRefund[]> = {}) {
    this.bySale = new Map(Object.entries(bySale));
  }

  refundsOfVoid(saleId: string): SaleVoidRefund[] {
    this.asked.push(saleId);
    return this.bySale.get(saleId) ?? [];
  }
}
