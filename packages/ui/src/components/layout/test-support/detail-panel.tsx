import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Modal } from "../../overlays/modal";
import { DetailPanel } from "../detail-panel";

export function SuppliersArea({
  areaWidth,
  children,
  footer,
}: {
  areaWidth: number;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);

  return (
    <div data-testid="area" style={{ display: "flex", width: `${areaWidth}px`, height: "600px" }}>
      <ul style={{ flex: 1 }}>
        {["Distribuidora Norte", "Almacén Sur"].map((supplier) => (
          <li key={supplier}>
            <button type="button" onClick={() => setOpenSupplier(supplier)}>
              {supplier}
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
