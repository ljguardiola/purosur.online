import {
  dataColumn,
  formatPointOfSaleNumber,
  StatusIndicator,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Clock } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import {
  clockCorrectionDay,
  clockCorrectionReading,
  clockCorrectionTime,
} from "./clock-correction-moments";
import type { ClockCorrection } from "./clock-corrections-api";

type ClockCorrectionsSectionProps = {
  data: CloudData<ClockCorrection[]>;
};

const NO_CORRECTIONS: ClockCorrection[] = [];

const columns = [
  dataColumn({
    id: "correctedAt",
    header: "Corregido",
    render: (item: ClockCorrection) => (
      <TableCellText description={clockCorrectionTime(item.correctedAt)}>
        {clockCorrectionDay(item.correctedAt)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (item: ClockCorrection) => (
      <TableCellText description={`Corrigió ${item.actorFirstName}`}>
        {`${item.registerName} · Punto de venta ${formatPointOfSaleNumber(item.pointOfSaleNumber)}`}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "previousReading",
    header: "Lectura anterior",
    render: (item: ClockCorrection) =>
      item.previousReadingSource === "tax_authority_day" ? (
        <TableCellText description="Último día autorizado por ARCA">
          {clockCorrectionDay(item.previousReading)}
        </TableCellText>
      ) : (
        clockCorrectionReading(item.previousReading)
      ),
  }),
  dataColumn({
    id: "correctedReading",
    header: "Lectura nueva",
    render: (item: ClockCorrection) => clockCorrectionReading(item.correctedReading),
  }),
  dataColumn({
    id: "alertState",
    header: "Aviso",
    render: (item: ClockCorrection) =>
      item.alertState === "open" ? (
        <StatusIndicator tone="warning">Abierto</StatusIndicator>
      ) : (
        <StatusIndicator tone="neutral">Cerrado</StatusIndicator>
      ),
  }),
] as const;

export function ClockCorrectionsSection({ data }: ClockCorrectionsSectionProps) {
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_CORRECTIONS,
    id: (item) => item.id,
    columns,
  });
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-text-accent text-subheading">Correcciones de reloj</h2>
      <Table
        aria-label="Correcciones de reloj"
        table={table}
        {...cloudTableState(data, "las correcciones de reloj")}
        empty={{
          icon: <Clock />,
          title: "Todavía no se corrigió ningún reloj",
          variant: "blank",
        }}
      />
    </section>
  );
}
