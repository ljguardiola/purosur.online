import type { PurchaseOrderDocument } from "./purchase-order-document.js";

export function renderPurchaseOrderText({
  title,
  createdDay,
  lines,
}: PurchaseOrderDocument): string {
  const blocks = lines.map((line, index) =>
    [
      `${index + 1}. ${line.product}`,
      `   ${line.quantity}`,
      ...(line.supplierItem === null ? [] : [`   Artículo del proveedor: ${line.supplierItem}`]),
    ].join("\n"),
  );
  return [[title, `Fecha: ${createdDay}`].join("\n"), ...blocks].join("\n\n");
}
