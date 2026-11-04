import { ONE_SALE_UNIT_QUANTITY } from "../model/purchase-line.js";
import { mayBeReceived } from "../model/purchase-order.js";
import {
  listCostCents,
  type OutstandingLoad,
  outstandingLoad,
  outstandingQuantity,
} from "../model/purchase-order-receipt.js";
import { supplierOfferPrice } from "../model/supplier-offer.js";
import type { PurchaseOrderReader, ReceivableOrderLineListing } from "./purchase-order-reader.js";

export interface GetPurchaseOrderReceiptDraftInput {
  locationId: string;
  orderId: string;
}

export type ReceiptDraftLine = { product: ReceivableOrderLineListing["product"] } & (
  | {
      loadedBy: "packages";
      packages: number;
      quantityPerPackage: number;
      listCostPerPackageCents: number | null;
    }
  | { loadedBy: "quantity"; quantity: number; listCostPerSaleUnitCents: number | null }
);

export interface PurchaseOrderReceiptDraft {
  supplier: { id: string; name: string };
  lines: ReceiptDraftLine[];
}

export type GetPurchaseOrderReceiptDraftOutcome =
  | { kind: "found"; draft: PurchaseOrderReceiptDraft }
  | { kind: "not_found" }
  | { kind: "not_receivable" };

function draftLine(line: ReceivableOrderLineListing, load: OutstandingLoad): ReceiptDraftLine {
  const price = line.supplierOffer
    ? supplierOfferPrice(line.supplierOffer, line.product.saleUnit)
    : undefined;
  const listCostOf = (quantity: number) =>
    price?.kind === "priced" ? listCostCents(price.pricePerSaleUnit, quantity) : null;
  return load.loadedBy === "packages"
    ? {
        product: line.product,
        loadedBy: "packages",
        packages: load.packages,
        quantityPerPackage: line.quantityPerPackage,
        listCostPerPackageCents: listCostOf(line.quantityPerPackage),
      }
    : {
        product: line.product,
        loadedBy: "quantity",
        quantity: load.quantity,
        listCostPerSaleUnitCents: listCostOf(ONE_SALE_UNIT_QUANTITY),
      };
}

export async function getPurchaseOrderReceiptDraft(
  reader: PurchaseOrderReader,
  { locationId, orderId }: GetPurchaseOrderReceiptDraftInput,
): Promise<GetPurchaseOrderReceiptDraftOutcome> {
  const order = await reader.receivableOrder(locationId, orderId);
  if (!order) {
    return { kind: "not_found" };
  }
  if (!mayBeReceived(order.state)) {
    return { kind: "not_receivable" };
  }
  const lines = order.lines.flatMap((line) => {
    const outstanding = outstandingQuantity(line, line.receivedQuantity);
    return outstanding === 0
      ? []
      : [draftLine(line, outstandingLoad(outstanding, line.quantityPerPackage))];
  });
  return { kind: "found", draft: { supplier: order.supplier, lines } };
}
