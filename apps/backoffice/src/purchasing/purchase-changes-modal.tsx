import type { PurchaseChange, PurchaseSummary } from "@purosur/contracts";
import {
  Button,
  dataColumn,
  Modal,
  SummaryRowGroup,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { History, X } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { purchaseChangeMoment, purchaseChangeRows } from "./purchase-change-text";
import type { fetchPurchaseChanges } from "./purchases-api";
import { usePurchaseChangesQuery } from "./purchasing-queries";

export type PurchaseChangesModalServices = {
  fetchPurchaseChanges: typeof fetchPurchaseChanges;
};

type PurchaseChangesModalProps = {
  target: PurchaseSummary | null;
  services: PurchaseChangesModalServices;
  onClose: () => void;
  onSessionEnded: () => void;
};

const NO_CHANGES: PurchaseChange[] = [];

export function PurchaseChangesModal({
  target,
  services,
  onClose,
  onSessionEnded,
}: PurchaseChangesModalProps) {
  const [shown, setShown] = useState<PurchaseSummary | null>(null);
  if (target !== null && target !== shown) {
    setShown(target);
  }
  const data = usePurchaseChangesQuery({
    purchaseId: target?.id ?? null,
    fetchPurchaseChanges: services.fetchPurchaseChanges,
    onSessionEnded,
  });

  const columns = [
    dataColumn({
      id: "actor",
      header: "Quién",
      render: (change: PurchaseChange) => (
        <TableCellText strong description={purchaseChangeMoment(change.correctedAt)}>
          {change.actor.name}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "change",
      header: "Qué cambió",
      render: (change: PurchaseChange) => {
        const [first, ...rest] = purchaseChangeRows(change.change);
        return first ? <SummaryRowGroup variant="plain" rows={[first, ...rest]} /> : null;
      },
    }),
  ] as const;

  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_CHANGES,
    id: (change) => change.id,
    columns,
  });

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<History />}
      context={`Stock · Compra · ${shown?.supplier.name ?? ""}`}
      title="Cambios de la compra"
      closable
      footer={
        <Button variant="secondary" size="large" icon={<X />} fullWidth onPress={onClose}>
          Cerrar
        </Button>
      }
    >
      {target === null ? null : (
        <Table
          aria-label="Cambios"
          table={table}
          {...cloudTableState(data, "los cambios")}
          empty={{ icon: <History />, title: "Sin cambios", variant: "blank" }}
        />
      )}
    </Modal>
  );
}
