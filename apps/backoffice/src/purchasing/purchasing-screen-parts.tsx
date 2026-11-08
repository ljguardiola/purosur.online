import { Button, formatCents } from "@purosur/ui";
import { X } from "lucide-react";
import { useSupplierNameQuery } from "./purchasing-queries";
import type { fetchSupplierName } from "./suppliers-api";

export function ExpectedTotalAmount({
  cents,
  hasUnpricedLine,
}: {
  cents: number;
  hasUnpricedLine: boolean;
}) {
  return (
    <div className="flex flex-col items-end">
      <span>{formatCents(cents)}</span>
      {hasUnpricedLine ? (
        <span className="text-detail text-text-subtle">Hay líneas sin precio de lista</span>
      ) : null}
    </div>
  );
}

export type SupplierFilter = { supplierId: string; onClear: () => void };

export type SupplierFilterServices = { fetchSupplierName: typeof fetchSupplierName };

export function SupplierFilterButton({
  supplierFilter,
  services,
  onSessionEnded,
}: {
  supplierFilter: SupplierFilter;
  services: SupplierFilterServices;
  onSessionEnded: () => void;
}) {
  const data = useSupplierNameQuery({
    supplierId: supplierFilter.supplierId,
    fetchSupplierName: services.fetchSupplierName,
    onSessionEnded,
  });
  const supplier = data.status === "loaded" ? data.value : undefined;
  return (
    <Button variant="secondary" icon={<X />} onPress={supplierFilter.onClear}>
      {supplier?.kind === "found" ? `Proveedor: ${supplier.name}` : "Proveedor"}
    </Button>
  );
}
