import {
  createSupplier,
  type PurchasingStore,
  type RegisterPurchaseLine,
  registerPurchase,
} from "@purosur/domain/purchasing/use-cases";
import { fixedZoneRulesSource } from "../../test-support/fixed-zone-rules-source.js";

export function quantityLine(
  productId: string,
  overrides: Partial<RegisterPurchaseLine> = {},
): RegisterPurchaseLine {
  return {
    loadedBy: "quantity",
    productId,
    quantity: 1_000,
    costPaidCents: 500,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

export async function registeredPurchase(
  context: {
    store: PurchasingStore;
    clock: { now(): Date };
    actorId: string;
    locationId: string;
  },
  lines: RegisterPurchaseLine[],
  supplierName = "Distribuidora Sur",
) {
  const { store, clock, actorId, locationId } = context;
  const supplier = await createSupplier(store, {
    name: supplierName,
    cuit: null,
    contact: null,
    note: null,
    actorId,
  });
  if (supplier.kind !== "created") {
    throw new Error(`test setup: creating the supplier ended as ${supplier.kind}`);
  }
  const outcome = await registerPurchase(
    { zoneRules: fixedZoneRulesSource(), store, clock },
    {
      supplierId: supplier.supplier.id,
      purchasedOn: "2026-10-01",
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: null,
      lines,
      actorId,
      locationId,
    },
  );
  if (outcome.kind !== "registered") {
    throw new Error(`test setup: registering the purchase ended as ${outcome.kind}`);
  }
  return outcome.purchase;
}
