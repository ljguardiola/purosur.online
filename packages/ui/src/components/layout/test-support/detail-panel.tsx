import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Modal } from "../../overlays/modal";
import { DetailPanel } from "../detail-panel";

type SupplierRow = { label: string; supplier: string };

const supplierRows: SupplierRow[] = [
  { label: "Distribuidora Norte", supplier: "Distribuidora Norte" },
  { label: "Almacén Sur", supplier: "Almacén Sur" },
];

export function SuppliersArea({
  areaWidth,
  children,
  footer,
  rows = supplierRows,
}: {
  areaWidth: number;
  children?: ReactNode;
  footer?: ReactNode;
  rows?: SupplierRow[];
}) {
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);

  return (
    <div data-testid="area" style={{ display: "flex", width: `${areaWidth}px`, height: "600px" }}>
      <ul style={{ flex: 1 }}>
        {rows.map(({ label, supplier }) => (
          <li key={label}>
            <button type="button" onClick={() => setOpenSupplier(supplier)}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <DetailPanel
        open={openSupplier !== null}
        onClose={() => setOpenSupplier(null)}
        title={openSupplier ?? ""}
        footer={footer}
      >
        {children ?? <p>Datos del proveedor</p>}
      </DetailPanel>
    </div>
  );
}

export function ConfirmationInsidePanel({ closable }: { closable: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setConfirming(true)}>
        Eliminar proveedor
      </button>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        closable={closable}
        tone="info"
        icon={<Info />}
        title="Confirmar eliminación"
        footer={<span />}
      >
        Confirmar
      </Modal>
    </>
  );
}
