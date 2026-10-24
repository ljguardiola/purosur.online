import type { SupplierPriceListReview } from "@purosur/contracts";

type RowStatus = SupplierPriceListReview["rows"][number]["status"];

export type SupplierPriceListRowStatus = {
  tone: "info" | "warning" | "success";
  label: string;
};

const STATUSES: Record<RowStatus, SupplierPriceListRowStatus> = {
  new: { tone: "info", label: "Nuevo" },
  price_changed: { tone: "warning", label: "Cambió el precio" },
  description_changed: { tone: "warning", label: "Cambió la descripción" },
  unlinked: { tone: "warning", label: "Sin vincular" },
  vat_rate_missing: { tone: "warning", label: "Falta el IVA" },
  linked: { tone: "success", label: "Vinculado" },
  reviewed: { tone: "success", label: "Revisado" },
};

export function supplierPriceListRowStatusOf(status: RowStatus): SupplierPriceListRowStatus {
  return STATUSES[status];
}
