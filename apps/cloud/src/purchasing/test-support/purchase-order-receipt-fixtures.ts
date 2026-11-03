import type { SaleUnit } from "@purosur/domain";
import {
  buildPurchaseOrders,
  type ReceivePurchaseOrderInput,
  receivePurchaseOrder,
  sharePurchaseOrder,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fixedZoneRulesSource } from "../../test-support/fixed-zone-rules-source.js";
import { DrizzlePurchaseOrderReceiptStore } from "../drizzle-purchase-order-receipt-store.js";
import { DrizzlePurchaseOrderStore } from "../drizzle-purchase-order-store.js";
import { insertOfferedProduct } from "./purchase-order-fixtures.js";
import { insertSupplier } from "./supplier-price-list-fixtures.js";

export const ORDERED_AT = new Date("2026-03-01T10:00:00.000Z");
export const SENT_AT = new Date("2026-03-02T10:00:00.000Z");
export const RECEIVED_AT = new Date("2026-03-10T12:00:00.000Z");

export interface OrderedProduct {
  name: string;
  packages: number;
  quantityPerPackage: number;
  packagePriceCents: number;
  saleUnit?: SaleUnit;
}

export async function insertSentOrder<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { actorId: string; locationId: string; products: readonly OrderedProduct[] },
): Promise<{ orderId: string; supplierId: string; productIds: string[] }> {
  const supplierId = await insertSupplier(db, { actorId: input.actorId });
  const productIds: string[] = [];
  for (const product of input.products) {
    const offered = await insertOfferedProduct(db, {
      actorId: input.actorId,
      supplierId,
      name: product.name,
      quantity: product.quantityPerPackage,
      priceCents: product.packagePriceCents,
      ...(product.saleUnit === undefined ? {} : { saleUnit: product.saleUnit }),
    });
    productIds.push(offered.productId);
  }
  const store = new DrizzlePurchaseOrderStore(db);
  const built = await buildPurchaseOrders(
    { store, clock: { now: () => ORDERED_AT } },
    {
      locationId: input.locationId,
      actorId: input.actorId,
      choices: input.products.map((product, index) => ({
        productId: productIds[index] as string,
        supplierId,
        packages: product.packages,
      })),
    },
  );
  if (built.kind !== "created") {
    throw new Error(`test setup: building ended as ${built.kind}`);
  }
  const [orderId] = built.orderIds as [string];
  const shared = await sharePurchaseOrder(
    { store, clock: { now: () => SENT_AT } },
    { locationId: input.locationId, orderId, actorId: input.actorId },
  );
  if (shared.kind !== "shared") {
    throw new Error(`test setup: sharing ended as ${shared.kind}`);
  }
  return { orderId, supplierId, productIds };
}

export function receiveOrder<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: Pick<ReceivePurchaseOrderInput, "locationId" | "orderId" | "actorId" | "lines"> & {
    at?: Date;
  },
) {
  const at = input.at ?? RECEIVED_AT;
  const { at: _at, ...receiving } = input;
  return receivePurchaseOrder(
    {
      store: new DrizzlePurchaseOrderReceiptStore(db, () => at),
      clock: { now: () => at },
      zoneRules: fixedZoneRulesSource(),
    },
    {
      purchasedOn: "2026-03-10",
      receiptType: "sin_comprobante",
      receiptNumber: null,
      note: null,
      ...receiving,
    },
  );
}
