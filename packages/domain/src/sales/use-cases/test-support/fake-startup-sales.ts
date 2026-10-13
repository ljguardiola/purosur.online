import type { StartupSale, StartupSales } from "../read-sales-to-print-at-startup.js";

export class FakeStartupSales implements StartupSales {
  private readonly sales: StartupSale[];

  constructor(sales: StartupSale[] = []) {
    this.sales = sales;
  }

  completedSalesOfOpenSession(): StartupSale[] {
    return this.sales;
  }
}
