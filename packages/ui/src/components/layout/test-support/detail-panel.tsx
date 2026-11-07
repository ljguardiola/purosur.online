import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../../forms/button";
import { Modal } from "../../overlays/modal";
import { DetailPanel } from "../detail-panel";

type SupplierRow = { id: string; label: string; supplier: string; focusedOnPress?: false };

const supplierRows: SupplierRow[] = [
  { id: "proveedor-1", label: "Distribuidora Norte", supplier: "Distribuidora Norte" },
  { id: "proveedor-2", label: "Almacén Sur", supplier: "Almacén Sur" },
];

export function SuppliersArea({
  areaWidth,
  children,
  footer,
  rows = supplierRows,
  rowButtons = "native",
}: {
  areaWidth: number;
  children?: ReactNode;
  footer?: ReactNode;
  rows?: SupplierRow[];
  rowButtons?: "native" | "design-system";
}) {
  const [openRow, setOpenRow] = useState<SupplierRow | null>(null);

  return (
    <div data-testid="area" style={{ display: "flex", width: `${areaWidth}px`, height: "600px" }}>
      <div style={{ flex: 1 }}>
        <p>Proveedores</p>
        <input type="search" aria-label="Buscar proveedor" />
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {rowButtons === "native" ? (
                <button
                  type="button"
                  onMouseDown={
                    row.focusedOnPress === false ? (event) => event.preventDefault() : undefined
                  }
                  onClick={() => setOpenRow(row)}
                >
                  {row.label}
                </button>
              ) : (
                <Button variant="text" onPress={() => setOpenRow(row)}>
                  {row.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <DetailPanel
        open={openRow !== null}
        onClose={() => setOpenRow(null)}
        recordKey={openRow?.id ?? ""}
        title={openRow?.supplier ?? ""}
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

export function DownloadInsidePanel() {
  function download() {
    const link = document.createElement("a");
    link.href = "#descarga";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  return (
    <button type="button" onClick={download}>
      Descargar listado
    </button>
  );
}
