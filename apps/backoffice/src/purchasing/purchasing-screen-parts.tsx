import { Button, formatCents } from "@purosur/ui";
import { X } from "lucide-react";

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

export function SupplierFilterButton({
  supplierName,
  onClear,
}: {
  supplierName: string | undefined;
  onClear: () => void;
}) {
  return (
    <Button variant="secondary" icon={<X />} onPress={onClear}>
      {`Proveedor: ${supplierName ?? "seleccionado"}`}
    </Button>
  );
}
