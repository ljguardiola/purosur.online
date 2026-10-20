import {
  decideConfirmation,
  isSupplierPriceListUnderReview,
} from "../model/supplier-price-list.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface ConfirmSupplierPriceListInput {
  listId: string;
  version: number;
  // The date a person typed in the review, null when none was typed.
  listDate: string | null;
  // The answer a person chose in the review, null when none was chosen.
  pricesIncludeVat: boolean | null;
  actorId: string;
  now: Date;
}

export type ConfirmSupplierPriceListOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "no_rows" }
  | { kind: "unpriced_rows" }
  | { kind: "list_date_missing" }
  | { kind: "vat_missing" }
  | { kind: "confirmed" };

export function confirmSupplierPriceList(
  store: SupplierPriceListStore,
  input: ConfirmSupplierPriceListInput,
): Promise<ConfirmSupplierPriceListOutcome> {
  return store.transaction<ConfirmSupplierPriceListOutcome>(async (tx) => {
    const locked = await tx.lockList(input.listId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!isSupplierPriceListUnderReview(locked.list.state)) {
      return { kind: "not_editable" };
    }
    if (locked.list.version !== input.version) {
      return { kind: "stale_version" };
    }

    const decision = decideConfirmation({
      rowPrices: locked.list.rowPrices,
      readListDate: locked.list.listDate,
      typedListDate: input.listDate,
      readPricesIncludeVat: locked.list.pricesIncludeVat,
      typedPricesIncludeVat: input.pricesIncludeVat,
    });
    if (decision.kind === "refused") {
      return { kind: decision.reason };
    }

    await tx.confirmList(
      input.listId,
      decision.listDate,
      decision.pricesIncludeVat,
      input.now,
      input.actorId,
    );
    return { kind: "confirmed" };
  });
}
