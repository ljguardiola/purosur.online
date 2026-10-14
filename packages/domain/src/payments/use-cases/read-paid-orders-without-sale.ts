import { paidOrderWithoutSaleBlocksSelling } from "../model/paid-order-discovery.js";
import type { LocalPaidOrders, PaidOrderWithoutSale } from "./paid-order-ports.js";

export interface ReadPaidOrdersWithoutSalePorts {
  local: LocalPaidOrders;
}

export interface ReadPaidOrdersWithoutSaleOutcome {
  kind: "read";
  paidOrders: PaidOrderWithoutSale[];
  sellingBlocked: boolean;
}

export function readPaidOrdersWithoutSale({
  local,
}: ReadPaidOrdersWithoutSalePorts): ReadPaidOrdersWithoutSaleOutcome {
  const all = local.paidOrdersWithoutSale();
  return {
    kind: "read",
    paidOrders: all.filter((paidOrder) => !paidOrder.resolved),
    sellingBlocked: paidOrderWithoutSaleBlocksSelling(all),
  };
}
