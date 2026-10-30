import {
  keepingRememberedVatRate,
  lastRowOfEachItem,
  sameSupplierItemKey,
  supersedesCurrentPrice,
} from "../model/supplier-item.js";
import {
  decideConfirmation,
  pricedRows,
  supplierPriceListConfirmationBlock,
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
  | { kind: "rereading" }
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
    const block = supplierPriceListConfirmationBlock({
      state: locked.list.state,
      rereading: locked.list.reread !== null,
    });
    if (block !== null) {
      return { kind: block };
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

    const groups = lastRowOfEachItem(pricedRows(await tx.listRows(input.listId)));
    const items = await tx.lockSupplierItems(
      locked.list.supplierId,
      groups.map((group) => group.key),
    );
    for (const { key, row, rows } of groups) {
      const link = rows.filter((other) => other.linkedByPerson).at(-1)?.link ?? null;
      const item = items.find((other) => sameSupplierItemKey(other.key, key));
      let itemId: string;
      if (item) {
        itemId = item.id;
        if (supersedesCurrentPrice(decision.listDate, item.currentListDate)) {
          await tx.describeSupplierItem(itemId, row.description);
        }
        if (link) {
          await tx.rememberSupplierItemLink(itemId, keepingRememberedVatRate(link, item.link));
        }
      } else {
        itemId = (
          await tx.addSupplierItem({
            supplierId: locked.list.supplierId,
            key,
            description: row.description,
            link,
          })
        ).id;
      }
      await tx.recordSupplierItemPrice({
        itemId,
        listId: input.listId,
        priceCents: row.priceCents,
        listDate: decision.listDate,
        pricesIncludeVat: decision.pricesIncludeVat,
      });
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
