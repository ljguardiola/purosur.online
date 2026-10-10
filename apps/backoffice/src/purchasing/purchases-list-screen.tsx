import type { PurchaseSummary } from "@purosur/contracts";
import {
  Button,
  dataColumn,
  FloatingNotification,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus, ShoppingCart } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { formatStockQuantity } from "../platform/stock-quantity";
import { ScreenLayout } from "../shell/screen-layout";
import { StockTopBar } from "../shell/stock-top-bar";
import type { PurchasesListScreenServices } from "./purchases-list-services";
import { usePurchasesQuery } from "./purchasing-queries";
import { receiptLabel } from "./receipt-label";

export type PurchasesListScreenProps = {
  registered: boolean;
  onNoticeDismissed: () => void;
  onSessionEnded: () => void;
  services: PurchasesListScreenServices;
};

type PurchaseLine = PurchaseSummary["lines"][number];

type PurchaseRow =
  | { kind: "purchase"; id: string; purchase: PurchaseSummary }
  | { kind: "line"; id: string; parentId: string; line: PurchaseLine };

const NO_PURCHASES: PurchaseSummary[] = [];

function rowsOf(purchases: readonly PurchaseSummary[]): PurchaseRow[] {
  return purchases.flatMap((purchase) => [
    { kind: "purchase" as const, id: purchase.id, purchase },
    ...purchase.lines.map((line) => ({
      kind: "line" as const,
      id: line.id,
      parentId: purchase.id,
      line,
    })),
  ]);
}

function parentIdOf(row: PurchaseRow): string | null {
  return row.kind === "line" ? row.parentId : null;
}

function quantityOf(line: PurchaseLine): string {
  const quantity = formatStockQuantity(line.quantity, line.product.saleUnit);
  return line.packaging === null || line.packages === null
    ? quantity
    : `${formatNumber(line.packages)} × ${line.packaging.name} (${quantity})`;
}

function saleUnitName(line: PurchaseLine): string {
  return line.product.saleUnit === "KG" ? "kg" : "u";
}

function unitCostOf(line: PurchaseLine): string {
  return `${formatCents(line.unitCostCents)} por ${saleUnitName(line)}`;
}

function costPaidOf(line: PurchaseLine): string {
  return `${formatCents(line.costPaidCents)} por ${line.packaging?.name ?? saleUnitName(line)}`;
}

function ofPurchase(row: PurchaseRow, render: (purchase: PurchaseSummary) => string): string {
  return row.kind === "purchase" ? render(row.purchase) : "";
}

function ofLine(row: PurchaseRow, render: (line: PurchaseLine) => string): string {
  return row.kind === "line" ? render(row.line) : "";
}

const columns = [
  dataColumn({
    id: "purchasedOn",
    header: "Fecha",
    render: (row: PurchaseRow) =>
      ofPurchase(row, (purchase) => formatDisplayDate(purchase.purchasedOn)),
  }),
  dataColumn({
    id: "supplier",
    header: "Proveedor",
    render: (row: PurchaseRow) => ofPurchase(row, (purchase) => purchase.supplier.name),
  }),
  dataColumn({
    id: "receipt",
    header: "Comprobante",
    render: (row: PurchaseRow) =>
      ofPurchase(row, (purchase) => receiptLabel(purchase.receiptType, purchase.receiptNumber)),
  }),
  dataColumn({
    id: "product",
    header: "Producto",
    render: (row: PurchaseRow) => ofLine(row, (line) => line.product.name),
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    render: (row: PurchaseRow) => ofLine(row, quantityOf),
  }),
  dataColumn({
    id: "costPaid",
    header: "Costo pagado",
    render: (row: PurchaseRow) => ofLine(row, costPaidOf),
  }),
  dataColumn({
    id: "unitCost",
    header: "Costo unitario",
    render: (row: PurchaseRow) => ofLine(row, unitCostOf),
  }),
  dataColumn({
    id: "lot",
    header: "Lote",
    render: (row: PurchaseRow) => ofLine(row, (line) => line.lotNumber ?? ""),
  }),
  dataColumn({
    id: "expiresOn",
    header: "Vencimiento",
    render: (row: PurchaseRow) =>
      ofLine(row, (line) => (line.expiresOn === null ? "" : formatDisplayDate(line.expiresOn))),
  }),
] as const;

export function PurchasesListScreen({
  registered,
  onNoticeDismissed,
  onSessionEnded,
  services,
}: PurchasesListScreenProps) {
  const navigate = useNavigate();
  const data = usePurchasesQuery({ fetchPurchases: services.fetchPurchases, onSessionEnded });
  const purchases = data.status === "loaded" ? data.value : NO_PURCHASES;

  const table = useTableModel({
    items: rowsOf(purchases),
    id: (row) => row.id,
    parentId: parentIdOf,
    columns,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Compras"
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                onPress={() => void navigate({ to: "/purchases/new" })}
              >
                Registrar compra
              </Button>
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
        <Table
          aria-label="Compras"
          table={table}
          {...cloudTableState(data, "las compras")}
          empty={{
            icon: <ShoppingCart />,
            title: "Todavía no hay compras registradas",
            variant: "blank",
          }}
        />
      </ScreenLayout>
      {registered ? (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title="Compra registrada"
          description="El stock ya refleja lo recibido."
          onDismiss={onNoticeDismissed}
        />
      ) : null}
    </>
  );
}
