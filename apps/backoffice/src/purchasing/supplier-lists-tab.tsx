import type { SupplierPriceListSummary } from "@purosur/contracts";
import { ButtonLink, dataColumn, StatusIndicator, Table, useTableModel } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { useSupplierPriceListsQuery } from "./purchasing-queries";
import type { SupplierPanelServices } from "./supplier-panel-services";
import { supplierPriceListOriginOf } from "./supplier-price-list-source";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";

const AllListsLink = createLink(ButtonLink);

const NO_LISTS: SupplierPriceListSummary[] = [];
const UNSET = "—";

const columns = [
  dataColumn({
    id: "source",
    header: "Origen",
    render: (list: SupplierPriceListSummary) => supplierPriceListOriginOf(list.source).name,
  }),
  dataColumn({
    id: "date",
    header: "Fecha de la lista",
    render: (list: SupplierPriceListSummary) =>
      list.listDate === null ? UNSET : formatDisplayDate(list.listDate),
  }),
  dataColumn({
    id: "state",
    header: "Estado",
    render: (list: SupplierPriceListSummary) => {
      const status = supplierPriceListStatusOf(list);
      return (
        <StatusIndicator tone={status.tone} busy={status.busy}>
          {status.label}
        </StatusIndicator>
      );
    },
  }),
] as const;

export type SupplierListsTabProps = {
  supplierId: string;
  services: Pick<SupplierPanelServices, "fetchSupplierPriceLists">;
  onSessionEnded: () => void;
};

export function SupplierListsTab({ supplierId, services, onSessionEnded }: SupplierListsTabProps) {
  const data = useSupplierPriceListsQuery({
    supplierId,
    fetchSupplierPriceLists: services.fetchSupplierPriceLists,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_LISTS,
    id: (list) => list.id,
    columns,
  });
  return (
    <div className="flex flex-col gap-3">
      <Table
        aria-label="Listas de precios del proveedor"
        variant="nested"
        table={table}
        {...cloudTableState(data, "las listas de precios")}
        empty={{ icon: <FileText />, title: "Sin listas de precios", variant: "blank" }}
      />
      <div>
        <AllListsLink variant="text" to="/suppliers/price-lists" search={{ supplier: supplierId }}>
          Ver todos
        </AllListsLink>
      </div>
    </div>
  );
}
