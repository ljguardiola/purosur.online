import type { SupplierPriceListSummary } from "@purosur/contracts";

export type SupplierPriceListOrigin = { name: string; detail: string };

export function supplierPriceListOriginOf(
  source: SupplierPriceListSummary["source"],
): SupplierPriceListOrigin {
  return source.kind === "PDF"
    ? { name: source.fileName, detail: "PDF" }
    : { name: source.url.replace(/^https?:\/\//i, ""), detail: "Página web" };
}
