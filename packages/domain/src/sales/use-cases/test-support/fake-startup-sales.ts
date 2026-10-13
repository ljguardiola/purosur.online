import type { StartupSale, StartupSales } from "../read-sales-to-print-at-startup.js";

export class FakeStartupSales implements StartupSales {
  asked = 0;
  private readonly sales: StartupSale[];

  constructor(sales: StartupSale[] = []) {
    this.sales = sales;
  }

  completedSalesOfOpenSession(): StartupSale[] {
    this.asked += 1;
    return this.sales;
  }
}
