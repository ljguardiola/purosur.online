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
}

// An item a person removed from the list, with the price it had when removed.
export interface RemovedItem {
  key: SupplierItemKey;
  priceCents: number | null;
}

// A row the page prints, with the link the supplier remembers for its item.
export interface RereadPageRow<TLink> extends PageFields {
  link: TLink | null;
}

export type RereadPlannedRow<TLink> =
  | ({ kind: "kept" | "repriced"; rowId: string } & PageFields)
  | ({ kind: "added"; link: TLink | null } & PageFields);

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

// Rows with the same key are matched in order of appearance. A row of the list or a removed item
// answers a printing only while its item has the same price on the page.
export function planReread<TLink>(
  currentRows: readonly RereadCurrentRow[],
  removedItems: readonly RemovedItem[],
  pageRows: readonly RereadPageRow<TLink>[],
): RereadPlan<TLink> {
  const unmatchedRows = currentRows.map((row) => ({ row, key: supplierItemKey(row) }));
  const unmatchedRemoved = [...removedItems];
  const remainingRemovedItems: RemovedItem[] = [];
  const rows: RereadPlannedRow<TLink>[] = [];

  for (const { link, ...fields } of pageRows) {
    const key = supplierItemKey(fields);
    const current = takeFirst(unmatchedRows, (other) => sameSupplierItemKey(other.key, key));
    if (current) {
      rows.push({
        kind: current.row.priceCents === fields.priceCents ? "kept" : "repriced",
        rowId: current.row.id,
        ...fields,
      });
      continue;
    }
    const removed = takeFirst(
      unmatchedRemoved,
      (other) => sameSupplierItemKey(other.key, key) && other.priceCents === fields.priceCents,
    );
    if (removed) {
      remainingRemovedItems.push(removed);
      continue;
    }
    rows.push({ kind: "added", link, ...fields });
  }

  return {
    rows,
    droppedRowIds: unmatchedRows.map(({ row }) => row.id),
    remainingRemovedItems,
  };
}
