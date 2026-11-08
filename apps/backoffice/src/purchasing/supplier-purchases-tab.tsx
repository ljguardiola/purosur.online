import type { PurchaseSummary } from "@purosur/contracts";
import { ButtonLink, dataColumn, Table, useTableModel } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { usePurchasesQuery } from "./purchasing-queries";
import { receiptLabel } from "./receipt-label";
import type { SupplierPanelServices } from "./supplier-panel-services";

const AllPurchasesLink = createLink(ButtonLink);

const NO_PURCHASES: PurchaseSummary[] = [];

const columns = [
  dataColumn({
    id: "purchasedOn",
    header: "Fecha",
    render: (purchase: PurchaseSummary) => formatDisplayDate(purchase.purchasedOn),
  }),
  dataColumn({
    id: "receipt",
    header: "Comprobante",
    render: (purchase: PurchaseSummary) =>
      receiptLabel(purchase.receiptType, purchase.receiptNumber),
  }),
] as const;

export type SupplierPurchasesTabProps = {
  supplierId: string;
  services: Pick<SupplierPanelServices, "fetchPurchases">;
  onSessionEnded: () => void;
};

export function SupplierPurchasesTab({
  supplierId,
  services,
  onSessionEnded,
}: SupplierPurchasesTabProps) {
  const data = usePurchasesQuery({
    supplierId,
    fetchPurchases: services.fetchPurchases,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_PURCHASES,
    id: (purchase) => purchase.id,
    columns,
  });
  return (
    <div className="flex flex-col gap-3">
      <Table
        aria-label="Compras del proveedor"
        variant="nested"
        table={table}
        {...cloudTableState(data, "las compras")}
        empty={{ icon: <ShoppingCart />, title: "Sin compras", variant: "blank" }}
      />
      <div>
        <AllPurchasesLink variant="text" to="/purchases" search={{ supplier: supplierId }}>
          Ver todos
        </AllPurchasesLink>
      </div>
    </div>
  );
}
