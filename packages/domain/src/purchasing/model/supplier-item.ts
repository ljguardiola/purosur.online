export interface SupplierItemKey {
  kind: "code" | "description";
  value: string;
}

export function normalizeSupplierItemDescription(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function supplierItemKey(item: {
  code: string | null;
  description: string;
}): SupplierItemKey {
  const code = item.code?.trim() ?? "";
  return code === ""
    ? { kind: "description", value: normalizeSupplierItemDescription(item.description) }
    : { kind: "code", value: code };
}
