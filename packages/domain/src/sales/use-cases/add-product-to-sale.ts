import type { Clock } from "../../shared/index.js";
import { addUnitToLine, mayBeSaleLineQuantity, newSaleLine } from "../model/sale-line.js";
import {
  type AddedLineOutcome,
  added,
  addLineToSale,
  isSaleAdditionRefusal,
  type SaleAdditionRefusal,
  saleToAddTo,
  validPromotions,
} from "./sale-addition.js";
import type { IdGenerator, SaleLedgerTransaction, SellableProduct } from "./sale-ledger.js";

export type AddProductToSaleOutcome =
  | SaleAdditionRefusal
  | { kind: "product_not_found" }
  | { kind: "weight_needed"; productId: string; productName: string }
  | { kind: "line_quantity_limit"; productName: string }
  | { kind: "no_price"; productName: string }
  | AddedLineOutcome;

export interface AddProductToSaleRequest {
  actorId: string;
  clock: Clock;
  ids: IdGenerator;
  findProduct: (tx: SaleLedgerTransaction) => SellableProduct | undefined;
}

export function addProductToSale(
  tx: SaleLedgerTransaction,
  { actorId, clock, ids, findProduct }: AddProductToSaleRequest,
): AddProductToSaleOutcome {
  const addition = saleToAddTo(tx, actorId, clock);
  if (isSaleAdditionRefusal(addition)) {
    return addition;
  }

  const product = findProduct(tx);
  if (!product) {
    return { kind: "product_not_found" };
  }
  const moment = clock.now();
  if (product.saleUnit === "KG") {
    return tx.priceAt(product.id, moment)
      ? { kind: "weight_needed", productId: product.id, productName: product.name }
      : { kind: "no_price", productName: product.name };
  }
  const { existing } = addition;
  const line = existing?.lines.find(
    (candidate) => candidate.productId === product.id && candidate.saleUnit === "UNIT",
  );
  if (existing && line) {
    const updated = addUnitToLine(line);
    if (!mayBeSaleLineQuantity(updated.quantity, "UNIT")) {
      return { kind: "line_quantity_limit", productName: product.name };
    }
    tx.recordChangedLine(updated);
    return added(tx, moment, {
      ...existing,
      lines: existing.lines.map((each) => (each === line ? updated : each)),
    });
  }
  const price = tx.priceAt(product.id, moment);
  if (!price) {
    return { kind: "no_price", productName: product.name };
  }
  return addLineToSale(tx, addition, ids, moment, (lineId) =>
    newSaleLine(lineId, product, price, validPromotions(tx, product.id, moment)),
  );
}
