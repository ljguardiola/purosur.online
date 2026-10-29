import { type LabelRequestEntry, productLabelCode } from "../model/label-request.js";
import type { CatalogNetContent } from "./catalog-store.js";
import type { LabelProductReader } from "./label-product-reader.js";

export interface LabelSheetItem {
  name: string;
  brandName: string | null;
  netContent: CatalogNetContent | null;
  code: string;
  count: number;
}

export type PrepareLabelSheetOutcome =
  | { kind: "ready"; items: LabelSheetItem[] }
  | { kind: "product_not_found"; productId: string }
  | { kind: "product_without_internal_barcode"; productId: string };

export async function prepareLabelSheet(
  reader: LabelProductReader,
  labels: readonly LabelRequestEntry[],
): Promise<PrepareLabelSheetOutcome> {
  const products = await reader.productsForLabels(labels.map((label) => label.productId));
  const productsById = new Map(products.map((product) => [product.id, product]));

  const items: LabelSheetItem[] = [];
  for (const label of labels) {
    const product = productsById.get(label.productId);
    if (!product?.active) {
      return { kind: "product_not_found", productId: label.productId };
    }
    const code = productLabelCode(product);
    if (code === null) {
      return { kind: "product_without_internal_barcode", productId: label.productId };
    }
    items.push({
      name: product.name,
      brandName: product.brandName,
      netContent: product.netContent,
      code,
      count: label.count,
    });
  }
  return { kind: "ready", items };
}
