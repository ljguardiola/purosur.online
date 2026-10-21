import { type SaleComprobante, saleComprobanteOf } from "../model/sale-history.js";
import type { RegisterSalesHistory } from "./register-sales-history.js";

export interface ReadSaleComprobantePorts {
  history: Pick<RegisterSalesHistory, "fiscalFactsOfSale">;
}

export function readSaleComprobante(
  { history }: ReadSaleComprobantePorts,
  { saleId }: { saleId: string },
): SaleComprobante {
  return saleComprobanteOf(history.fiscalFactsOfSale(saleId));
}
