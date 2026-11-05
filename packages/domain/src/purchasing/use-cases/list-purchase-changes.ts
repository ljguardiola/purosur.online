import type {
  PurchaseChangeListing,
  PurchaseChangeProduct,
  PurchaseChangeReader,
} from "./purchase-change-reader.js";
import type {
  AddedLineRecord,
  PurchaseHeaderChange,
  PurchaseLineQuantity,
} from "./purchase-correction-store.js";

export interface ListPurchaseChangesInput {
  locationId: string;
  purchaseId: string;
}

export interface ListedAddedLine extends Omit<AddedLineRecord, "productId"> {
  product: PurchaseChangeProduct;
}

interface ChangeOfLine {
  lineId: string;
  product: PurchaseChangeProduct;
}

export type ListedPurchaseChangeDetail =
  | { kind: "header"; changes: PurchaseHeaderChange[] }
  | { kind: "lines_added"; lines: ListedAddedLine[] }
  | (ChangeOfLine & { kind: "line_expiry"; previous: string | null; next: string | null })
  | (ChangeOfLine & {
      kind: "line_expiry_split";
      quantity: number;
      previous: string | null;
      next: string | null;
    })
  | (ChangeOfLine & { kind: "line_cost"; previous: number; next: number })
  | (ChangeOfLine & {
      kind: "line_quantity";
      previous: PurchaseLineQuantity;
      next: PurchaseLineQuantity;
    })
  | {
      kind: "line_product";
      lineId: string;
      previous: PurchaseChangeProduct;
      next: PurchaseChangeProduct;
    }
  | (ChangeOfLine & {
      kind: "line_removed";
      quantity: number;
      packages: number | null;
      costPaidCents: number;
      expiresOn: string | null;
    });

export interface ListedPurchaseChange extends Omit<PurchaseChangeListing, "change"> {
  change: ListedPurchaseChangeDetail;
}

export type ListPurchaseChangesOutcome =
  | { kind: "not_found" }
  | { kind: "listed"; changes: ListedPurchaseChange[] };

interface ChangeWithLineProduct {
  listing: PurchaseChangeListing;
  // The product the line the change names had when the change was made.
  lineProductId: string | undefined;
}

function withLineProducts(
  newestFirst: readonly PurchaseChangeListing[],
  currentProductOfLine: ReadonlyMap<string, string>,
): ChangeWithLineProduct[] {
  const productOfLine = new Map(currentProductOfLine);
  return newestFirst.map((listing) => {
    const { change } = listing;
    if (change.kind === "header" || change.kind === "lines_added") {
      return { listing, lineProductId: undefined };
    }
    const lineProductId = productOfLine.get(change.lineId);
    if (change.kind === "line_product") {
      productOfLine.set(change.lineId, change.previous);
    }
    return { listing, lineProductId };
  });
}

function lineProductOf(lineId: string, lineProductId: string | undefined): string {
  if (lineProductId === undefined) {
    throw new Error(`the line ${lineId} of a purchase change is gone`);
  }
  return lineProductId;
}

function productIdsNamedBy(entry: ChangeWithLineProduct): string[] {
  const { change } = entry.listing;
  switch (change.kind) {
    case "header":
      return [];
    case "lines_added":
      return change.lines.map(({ productId }) => productId);
    case "line_product":
      return [change.previous, change.next];
    default:
      return [lineProductOf(change.lineId, entry.lineProductId)];
  }
}

function describedChange(
  entry: ChangeWithLineProduct,
  described: (productId: string) => PurchaseChangeProduct,
): ListedPurchaseChangeDetail {
  const { change } = entry.listing;
  switch (change.kind) {
    case "header":
      return change;
    case "lines_added":
      return {
        kind: "lines_added",
        lines: change.lines.map(({ productId, ...line }) => ({
          ...line,
          product: described(productId),
        })),
      };
    case "line_product":
      return { ...change, previous: described(change.previous), next: described(change.next) };
    case "line_removed": {
      const { productId: _recorded, ...removed } = change;
      return {
        ...removed,
        product: described(lineProductOf(change.lineId, entry.lineProductId)),
      };
    }
    default:
      return {
        ...change,
        product: described(lineProductOf(change.lineId, entry.lineProductId)),
      };
  }
}

export async function listPurchaseChanges(
  reader: PurchaseChangeReader,
  input: ListPurchaseChangesInput,
): Promise<ListPurchaseChangesOutcome> {
  const changes = await reader.purchaseChanges(input.locationId, input.purchaseId);
  if (changes === undefined) {
    return { kind: "not_found" };
  }
  const entries = withLineProducts(
    [...changes].sort((a, b) => b.correctedAt.getTime() - a.correctedAt.getTime()),
    await reader.productOfEachLine(input.purchaseId),
  );
  const products = await reader.describedProducts([...new Set(entries.flatMap(productIdsNamedBy))]);
  const described = (productId: string) => {
    const product = products.get(productId);
    if (!product) {
      throw new Error(`the product ${productId} of a purchase change is gone`);
    }
    return product;
  };
  return {
    kind: "listed",
    changes: entries.map((entry) => {
      const { change, ...listing } = entry.listing;
      return { ...listing, change: describedChange(entry, described) };
    }),
  };
}
