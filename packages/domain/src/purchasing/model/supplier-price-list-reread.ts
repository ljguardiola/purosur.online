import { type SupplierItemKey, sameSupplierItemKey, supplierItemKey } from "./supplier-item.js";

interface PageFields {
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
  barcode: string | null;
}

export interface RereadCurrentRow {
  id: string;
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  // The price the page printed for the row when it was last read, whatever the review typed since.
  pagePriceCents: number | null;
}

// An item a person removed from the list, with the price the page printed for it.
export interface RemovedItem {
  key: SupplierItemKey;
  priceCents: number | null;
}

// A row the page prints, with the link the supplier remembers for its item.
export interface RereadPageRow<TLink> extends PageFields {
  link: TLink | null;
}

// A planned row holds the page's price as its page price, and as its price unless it is kept.
type PlannedFields = PageFields & { pagePriceCents: number | null };

type RereadPlannedRow<TLink> =
  | ({ kind: "kept" | "repriced"; rowId: string } & PlannedFields)
  | ({ kind: "added"; link: TLink | null } & PlannedFields);

export interface RereadPlan<TLink> {
  // The list's rows after the reread, in the page's order.
  rows: RereadPlannedRow<TLink>[];
  droppedRowIds: string[];
  remainingRemovedItems: RemovedItem[];
}

function takeFirst<T>(candidates: T[], matches: (candidate: T) => boolean): T | undefined {
  const index = candidates.findIndex(matches);
  return index === -1 ? undefined : candidates.splice(index, 1)[0];
}

// A printing first answers a row of the list, then a removed item, of the same item at the same
// price the page printed last time, whatever the order the page prints them in. Only a printing
// left over takes a remaining row of the same item, in order of appearance, at its new price; any
// other is added.
export function planReread<TLink>(
  currentRows: readonly RereadCurrentRow[],
  removedItems: readonly RemovedItem[],
  pageRows: readonly RereadPageRow<TLink>[],
): RereadPlan<TLink> {
  const unmatchedRows = currentRows.map((row) => ({ row, key: supplierItemKey(row) }));
  const unmatchedRemoved = [...removedItems];
  const remainingRemovedItems: RemovedItem[] = [];
  const printings = pageRows.map(({ link, ...fields }) => ({
    link,
    fields,
    key: supplierItemKey(fields),
  }));

  const answers = printings.map(({ fields, key }) => {
    const samePrice = (other: { key: SupplierItemKey; priceCents: number | null }) =>
      sameSupplierItemKey(other.key, key) && other.priceCents === fields.priceCents;
    const kept = takeFirst(unmatchedRows, ({ row, key: rowKey }) =>
      samePrice({ key: rowKey, priceCents: row.pagePriceCents }),
    );
    if (kept) {
      return { kind: "kept" as const, rowId: kept.row.id, priceCents: kept.row.priceCents };
    }
    const removed = takeFirst(unmatchedRemoved, samePrice);
    if (removed) {
      remainingRemovedItems.push(removed);
      return { kind: "removed" as const };
    }
    return null;
  });

  const rows: RereadPlannedRow<TLink>[] = [];
  printings.forEach(({ link, fields, key }, index) => {
    const answer = answers[index];
    if (answer?.kind === "removed") {
      return;
    }
    const planned = { ...fields, pagePriceCents: fields.priceCents };
    if (answer?.kind === "kept") {
      rows.push({ kind: "kept", rowId: answer.rowId, ...planned, priceCents: answer.priceCents });
      return;
    }
    const repriced = takeFirst(unmatchedRows, (other) => sameSupplierItemKey(other.key, key));
    rows.push(
      repriced
        ? { kind: "repriced", rowId: repriced.row.id, ...planned }
        : { kind: "added", link, ...planned },
    );
  });

  return {
    rows,
    droppedRowIds: unmatchedRows.map(({ row }) => row.id),
    remainingRemovedItems,
  };
}
