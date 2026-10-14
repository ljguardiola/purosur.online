import { salePrintStanding, type UnprintedSaleStanding } from "../model/sale-print-standing.js";

export interface StartupSale {
  saleId: string;
  completedAt: Date;
  total: number;
  printAttemptedAt: Date | null;
  printedAt: Date | null;
}

export interface StartupSales {
  completedSalesOfOpenSession(): StartupSale[];
}

export interface SaleToPrintAtStartup {
  saleId: string;
  completedAt: Date;
  total: number;
  standing: UnprintedSaleStanding;
}

export function readSalesToPrintAtStartup({
  sales,
}: {
  sales: StartupSales;
}): SaleToPrintAtStartup[] {
  return sales
    .completedSalesOfOpenSession()
    .flatMap(({ saleId, completedAt, total, ...delivery }) => {
      const standing = salePrintStanding(delivery);
      return standing === "printed" ? [] : [{ saleId, completedAt, total, standing }];
    });
}
