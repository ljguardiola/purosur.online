import {
  type FreightSummary,
  freightPeriodDaysSchema,
  freightPeriodSchema,
} from "@purosur/contracts";
import {
  ButtonLink,
  dataColumn,
  formatCents,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { useFreightsQuery } from "./purchasing-queries";
import type { SupplierPanelServices } from "./supplier-panel-services";

const AllFreightsLink = createLink(ButtonLink);

const NO_FREIGHTS: FreightSummary[] = [];
const LONGEST_PERIOD = freightPeriodSchema.parse(Math.max(...freightPeriodDaysSchema.values));

const columns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (freight: FreightSummary) => formatDisplayDate(freight.date),
  }),
  dataColumn({
    id: "freight",
    header: "Flete",
    render: (freight: FreightSummary) => freight.description,
  }),
  dataColumn({
    id: "amount",
    header: "Monto",
    align: "end",
    render: (freight: FreightSummary) => (
      <TableCellText strong>{formatCents(freight.amountCents)}</TableCellText>
    ),
  }),
] as const;

export type SupplierFreightsTabProps = {
  supplierId: string;
  services: Pick<SupplierPanelServices, "fetchFreights">;
  onSessionEnded: () => void;
};

export function SupplierFreightsTab({
  supplierId,
  services,
  onSessionEnded,
}: SupplierFreightsTabProps) {
  const data = useFreightsQuery({
    input: { period: LONGEST_PERIOD, search: "", supplierId },
    fetchFreights: services.fetchFreights,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value.items : NO_FREIGHTS,
    id: (freight) => freight.id,
    columns,
  });
  return (
    <div className="flex flex-col gap-3">
      <Table
        aria-label="Fletes del proveedor"
        variant="nested"
        table={table}
        {...cloudTableState(data, "los fletes")}
        empty={{ icon: <Truck />, title: "Sin fletes", variant: "blank" }}
      />
      <div>
        <AllFreightsLink
          variant="text"
          to="/purchases/freights"
          search={{ period: LONGEST_PERIOD, supplier: supplierId }}
        >
          Ver todos
        </AllFreightsLink>
      </div>
    </div>
  );
}
