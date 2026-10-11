import type { StockBalance, StockLotBreakdown } from "@purosur/contracts";
import {
  dataColumn,
  formatCalendarDay,
  formatCents,
  Modal,
  Table,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { Layers, PackageX } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import type { fetchProductLots } from "./stock-api";
import { useProductLotsQuery } from "./stock-queries";

type StockLot = StockLotBreakdown["lots"][number];

export type StockLotsModalServices = {
  fetchProductLots: typeof fetchProductLots;
};

type StockLotsModalProps = {
  product: StockBalance;
  services: StockLotsModalServices;
  onClose: () => void;
  onSessionEnded: () => void;
};

const NO_LOTS: StockLot[] = [];

function lotLabel(lot: StockLot): string {
  if (lot.technical) {
    return "Lote técnico";
  }
  return lot.lotNumber ?? "Sin número";
}

export function StockLotsModal({
  product,
  services,
  onClose,
  onSessionEnded,
}: StockLotsModalProps) {
  const data = useProductLotsQuery({
    productId: product.id,
    fetchProductLots: services.fetchProductLots,
    onSessionEnded,
  });
  const found = data.status !== "loaded" || data.value.found;
  const lots = data.status === "loaded" && data.value.found ? data.value.lots : NO_LOTS;

  const columns = [
    dataColumn({ id: "lot", header: "Lote", render: (lot: StockLot) => lotLabel(lot) }),
    dataColumn({
      id: "expiresOn",
      header: "Vence",
      render: (lot: StockLot) =>
        lot.expiresOn === null ? "Sin vencimiento" : formatCalendarDay(lot.expiresOn),
    }),
    dataColumn({
      id: "purchasedOn",
      header: "Comprado",
      render: (lot: StockLot) =>
        lot.purchasedOn === null ? "—" : formatCalendarDay(lot.purchasedOn),
    }),
    dataColumn({
      id: "remaining",
      header: "Cantidad",
      align: "end",
      render: (lot: StockLot) => formatStockQuantity(lot.remaining, product.saleUnit),
    }),
    dataColumn({
      id: "value",
      header: "Valor a costo",
      align: "end",
      render: (lot: StockLot) =>
        lot.valueCents === null ? (
          <Tag tone="neutral">Costo incompleto</Tag>
        ) : (
          formatCents(lot.valueCents)
        ),
    }),
  ] as const;

  const table = useTableModel({ items: lots, id: (lot) => lot.id, columns });

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<Layers />}
      context="Stock · Saldos"
      title={product.name}
      closable
      bodyPadding="none"
      footer={null}
    >
      <Table
        aria-label="Lotes"
        table={table}
        {...cloudTableState(data, "los lotes")}
        empty={
          found
            ? {
                icon: <Layers />,
                title: "Este producto no tiene lotes con saldo",
                variant: "blank",
              }
            : { icon: <PackageX />, title: "Este producto ya no existe", variant: "blank" }
        }
      />
    </Modal>
  );
}
