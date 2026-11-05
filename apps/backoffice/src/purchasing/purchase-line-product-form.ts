import type { PurchaseLineProductChangeBody } from "@purosur/contracts";

export type PurchaseLineProductValues = { productId: string };

export const EMPTY_PURCHASE_LINE_PRODUCT: PurchaseLineProductValues = { productId: "" };

export function purchaseLineProductRequestFrom({
  productId,
}: PurchaseLineProductValues): PurchaseLineProductChangeBody {
  return { productId };
}

export const PURCHASE_LINE_PRODUCT_FIELDS = { productId: "productId" } as const;

export function purchaseLineProductMessage({ productId }: PurchaseLineProductValues): string {
  return productId === ""
    ? "Elegí el producto."
    : "Este producto no se puede recibir en la cantidad de la línea. Elegí otro.";
}
