import {
  Button,
  dataColumn,
  formatDayAndTime,
  formatPointOfSaleNumber,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Laptop } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";

type OfflinePointsOfSaleSectionProps = {
  data: CloudData<OfflinePointOfSale[]>;
  onRetire: (item: OfflinePointOfSale) => void;
};

const NO_ITEMS: OfflinePointOfSale[] = [];

export function OfflinePointsOfSaleSection({ data, onRetire }: OfflinePointsOfSaleSectionProps) {
  const withoutRegister = (data.status === "loaded" ? data.value : NO_ITEMS).filter(
    ({ assigned }) => !assigned,
  );
  const columns = [
    dataColumn({
      id: "pointOfSale",
      header: "Punto de venta",
      render: (item: OfflinePointOfSale) => formatPointOfSaleNumber(item.pointOfSaleNumber),
    }),
    dataColumn({
      id: "usedBy",
      header: "Usado por",
      render: (item: OfflinePointOfSale) => item.registerName,
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (item: OfflinePointOfSale) =>
        item.retiredAt === null ? (
          <StatusIndicator tone="warning">Sin caja</StatusIndicator>
        ) : (
          <span className="flex items-center gap-2">
            <StatusIndicator tone="neutral">Dado de baja</StatusIndicator>
            <span className="text-text-subtle text-detail">{formatDayAndTime(item.retiredAt)}</span>
          </span>
        ),
    }),
    dataColumn({
      id: "actions",
      header: "Acciones",
      align: "end",
      render: (item: OfflinePointOfSale) =>
        item.retiredAt === null ? (
          <Button
            variant="text"
            destructive
            size="small"
            dataStatus={data.status}
            onPress={() => onRetire(item)}
          >
            Dar de baja
          </Button>
        ) : null,
    }),
  ] as const;
  const table = useTableModel({
    items: withoutRegister,
    id: (item) => String(item.pointOfSaleNumber),
    columns,
  });

  return (
    <section className="flex flex-col gap-3">
      <Table
        aria-label="Puntos de venta CAEA sin caja"
        table={table}
        {...cloudTableState(data, "los puntos de venta CAEA sin caja")}
        empty={{
          icon: <Laptop />,
          title: "Ningún punto de venta CAEA quedó sin caja.",
          description: "Aparecen acá los que una caja dejó de usar.",
          variant: "blank",
        }}
      />
    </section>
  );
}
