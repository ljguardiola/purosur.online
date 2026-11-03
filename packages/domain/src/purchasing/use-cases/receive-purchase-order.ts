import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { hasPurchaseLines, isPurchaseDateInFuture } from "../model/purchase.js";
import { mayBeReceived, type PurchaseOrderState } from "../model/purchase-order.js";
import {
  missingQuantity,
  outstandingQuantity,
  priceDifferenceCents,
  stateAfterReceipt,
} from "../model/purchase-order-receipt.js";
import { supplierOfferOfOrderLine, supplierOfferPrice } from "../model/supplier-offer.js";
import type { LineRefusal } from "./purchase-line-resolution.js";
import type {
  PurchaseOrderReceiptLineFields,
  PurchaseOrderReceiptStore,
} from "./purchase-order-receipt-store.js";
import { type PurchaseToRecord, recordPurchase } from "./purchase-recording.js";

export interface ReceivePurchaseOrderInput extends Omit<PurchaseToRecord, "supplierId"> {
  orderId: string;
}

export interface ReceivePurchaseOrderPorts {
  store: PurchaseOrderReceiptStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type ReceivePurchaseOrderOutcome =
  | { kind: "no_lines" }
  | { kind: "date_in_future" }
  | { kind: "not_found" }
  | { kind: "not_receivable" }
  | { kind: "nothing_ordered_received" }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | LineRefusal
  | {
      kind: "received";
      purchaseId: string;
      state: Extract<PurchaseOrderState, "PARTIALLY_RECEIVED" | "RECEIVED">;
    };

export async function receivePurchaseOrder(
  { store, clock, zoneRules }: ReceivePurchaseOrderPorts,
  input: ReceivePurchaseOrderInput,
): Promise<ReceivePurchaseOrderOutcome> {
  if (!hasPurchaseLines(input.lines.length)) {
    return { kind: "no_lines" };
  }
  const receivedAt = clock.now();
  if (isPurchaseDateInFuture(input.purchasedOn, receivedAt, zoneRules.zoneRules())) {
    return { kind: "date_in_future" };
  }

  return store.transaction<ReceivePurchaseOrderOutcome>(async (tx) => {
    const locked = await tx.lockPurchaseOrder(input.locationId, input.orderId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    const { order } = locked;
    if (!mayBeReceived(order.state)) {
      return { kind: "not_receivable" };
    }
    const orderedProducts = new Set(order.lines.map((line) => line.productId));
    if (!input.lines.some((line) => orderedProducts.has(line.productId))) {
      return { kind: "nothing_ordered_received" };
    }

    const recording = await recordPurchase(
      tx,
      { ...input, supplierId: order.supplierId },
      receivedAt,
    );
    if (recording.kind !== "recorded") {
      return recording;
    }
    const { purchase, saleUnits } = recording;

    const receivedBefore = await tx.receivedQuantities(order.id);
    const receiptLines: PurchaseOrderReceiptLineFields[] = [];
    const missingPerLine: number[] = [];
    for (const line of order.lines) {
      const arrived = purchase.lines.filter(({ productId }) => productId === line.productId);
      const receivedQuantity = arrived.reduce((total, { quantity }) => total + quantity, 0);
      const outstanding = outstandingQuantity(line, receivedBefore.get(line.id) ?? 0);
      const missing = missingQuantity(outstanding, receivedQuantity);
      missingPerLine.push(missing);
      if (outstanding === 0 && receivedQuantity === 0) {
        continue;
      }

      const saleUnit = saleUnits.get(line.productId);
      const offer =
        saleUnit === undefined
          ? undefined
          : supplierOfferOfOrderLine(
              await tx.supplierOffers(order.supplierId, line.productId),
              saleUnit,
              line.quantityPerPackage,
            );
      const listPrice =
        saleUnit === undefined || offer === undefined ? null : supplierOfferPrice(offer, saleUnit);
      receiptLines.push({
        purchaseOrderLineId: line.id,
        receivedQuantity,
        missingQuantity: missing,
        priceDifferenceCents: priceDifferenceCents(
          arrived,
          listPrice?.kind === "priced" ? listPrice.pricePerSaleUnit : null,
        ),
      });
    }

    const state = stateAfterReceipt(missingPerLine);
    await tx.insertPurchaseOrderReceipt({
      purchaseOrderId: order.id,
      purchaseId: purchase.id,
      actorId: input.actorId,
      receivedAt,
      lines: receiptLines,
    });
    await tx.markPurchaseOrderReceived(order.id, { state, receivedAt });
    return { kind: "received", purchaseId: purchase.id, state };
  });
}
