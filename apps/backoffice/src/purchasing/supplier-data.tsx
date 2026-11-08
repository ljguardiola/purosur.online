import type { SupplierSummary } from "@purosur/contracts";
import { Button, StatusIndicator, SummaryRowGroup } from "@purosur/ui";
import { Ban, Pencil, RotateCcw } from "lucide-react";

export type SupplierDataProps = {
  supplier: SupplierSummary;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
};

const UNSET = "—";

export function SupplierData({ supplier, onEdit, onDeactivate, onReactivate }: SupplierDataProps) {
  return (
    <div className="flex flex-col gap-4">
      <SummaryRowGroup
        variant="filled"
        rows={[
          { label: "CUIT", value: supplier.cuit ?? UNSET },
          { label: "Contacto", value: supplier.contact ?? UNSET },
          { label: "Nota", value: supplier.note ?? UNSET },
          {
            label: "Estado",
            value: supplier.active ? (
              <StatusIndicator tone="success">Activo</StatusIndicator>
            ) : (
              <StatusIndicator tone="neutral">Inactivo</StatusIndicator>
            ),
          },
        ]}
      />
      <div className="flex gap-3">
        <Button variant="secondary" icon={<Pencil />} onPress={onEdit}>
          Editar
        </Button>
        {supplier.active ? (
          <Button variant="secondary" icon={<Ban />} onPress={onDeactivate}>
            Desactivar
          </Button>
        ) : (
          <Button variant="secondary" icon={<RotateCcw />} onPress={onReactivate}>
            Reactivar
          </Button>
        )}
      </div>
    </div>
  );
}
