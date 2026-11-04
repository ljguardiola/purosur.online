import type { PurchaseSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Check,
  History,
  PackagePlus,
  Pencil,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { ProductCreationModal } from "../platform/creation-parts";
import { formatDisplayDate } from "../platform/display-date";
import { formatStockQuantity } from "../platform/stock-quantity";
import { AreaTopBar } from "../shell/area-top-bar";
import { type BackofficeAccess, canRecordPurchases } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { AddPurchaseLinesModal } from "./add-purchase-lines-modal";
import { CorrectPurchaseHeaderModal } from "./correct-purchase-header-modal";
import {
  CorrectPurchaseLineExpiryModal,
  type PurchaseLineExpiryTarget,
} from "./correct-purchase-line-expiry-modal";
import { PurchaseChangesModal } from "./purchase-changes-modal";
import type { PurchasesListScreenServices } from "./purchases-list-services";
import { usePurchasesQuery, useRefreshPurchasing } from "./purchasing-queries";
import { receiptLabel } from "./receipt-label";

export type PurchasesListScreenProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
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

type Correction = "linesAdded" | "headerCorrected" | "expiryCorrected";

type CorrectionNotice = { correction: Correction; purchase: PurchaseSummary };

const CORRECTION_NOTICES = {
  linesAdded: () => ({
    title: "Productos agregados",
    description: "El stock ya refleja lo recibido.",
  }),
  headerCorrected: (purchase) => ({
    title: "Datos corregidos",
    description: `La compra de ${purchase.supplier.name} del ${formatDisplayDate(purchase.purchasedOn)}.`,
  }),
  expiryCorrected: () => ({
    title: "Vencimiento corregido",
    description: "Las alertas y los listados usan la fecha corregida.",
  }),
} satisfies Record<
  Correction,
  (purchase: PurchaseSummary) => { title: string; description: string }
>;

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
  return line.packages === null
    ? quantity
    : `${formatNumber(line.packages)} × ${formatStockQuantity(line.quantityPerPackage, line.product.saleUnit)} (${quantity})`;
}

function saleUnitName(line: PurchaseLine): string {
  return line.product.saleUnit === "KG" ? "kg" : "u";
}

function unitCostOf(line: PurchaseLine): string {
  return `${formatCents(line.unitCostCents)} por ${saleUnitName(line)}`;
}

function costPaidOf(line: PurchaseLine): string {
  return `${formatCents(line.costPaidCents)} por ${line.packages === null ? saleUnitName(line) : "paquete"}`;
}

function ofPurchase(row: PurchaseRow, render: (purchase: PurchaseSummary) => string): string {
  return row.kind === "purchase" ? render(row.purchase) : "";
}

function ofLine(row: PurchaseRow, render: (line: PurchaseLine) => string): string {
  return row.kind === "line" ? render(row.line) : "";
}

type RowActions = {
  seeChanges: (purchase: PurchaseSummary) => void;
  addLines: (purchase: PurchaseSummary) => void;
  correctHeader: (purchase: PurchaseSummary) => void;
  correctExpiry: (target: PurchaseLineExpiryTarget) => void;
};

function purchaseSubject(purchase: PurchaseSummary): string {
  return `la compra de ${purchase.supplier.name}`;
}

const dataColumns = [
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
    render: (row: PurchaseRow) => ofLine(row, (line) => formatProductDescription(line.product)),
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
    render: (row: PurchaseRow) => ofLine(row, (line) => line.lotName),
  }),
  dataColumn({
    id: "expiresOn",
    header: "Vencimiento",
    render: (row: PurchaseRow) =>
      ofLine(row, (line) => (line.expiresOn === null ? "" : formatDisplayDate(line.expiresOn))),
  }),
] as const;

function columnsFor(
  actions: RowActions,
  purchaseOf: (parentId: string) => PurchaseSummary | undefined,
  mayRecord: boolean,
) {
  return [
    ...dataColumns,
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (row: PurchaseRow) =>
          row.kind === "purchase"
            ? {
                icon: <History />,
                "aria-label": `Ver los cambios de ${purchaseSubject(row.purchase)}`,
                onPress: () => actions.seeChanges(row.purchase),
              }
            : undefined,
        (row: PurchaseRow) =>
          mayRecord && row.kind === "purchase"
            ? {
                icon: <PackagePlus />,
                "aria-label": `Agregar productos a ${purchaseSubject(row.purchase)}`,
                onPress: () => actions.addLines(row.purchase),
              }
            : undefined,
        (row: PurchaseRow) => {
          if (!mayRecord) {
            return undefined;
          }
          if (row.kind === "purchase") {
            return {
              icon: <Pencil />,
              "aria-label": `Corregir los datos de ${purchaseSubject(row.purchase)}`,
              onPress: () => actions.correctHeader(row.purchase),
            };
          }
          const purchase = purchaseOf(row.parentId);
          return purchase
            ? {
                icon: <CalendarClock />,
                "aria-label": `Corregir el vencimiento de ${formatProductDescription(row.line.product)}`,
                onPress: () => actions.correctExpiry({ purchase, line: row.line }),
              }
            : undefined;
        },
      ],
    }),
  ] as const;
}

export function PurchasesListScreen({
  access,
  productCreationModal,
  registered,
  onNoticeDismissed,
  onSessionEnded,
  services,
}: PurchasesListScreenProps) {
  const navigate = useNavigate();
  const data = usePurchasesQuery({ fetchPurchases: services.fetchPurchases, onSessionEnded });
  const purchases = data.status === "loaded" ? data.value : NO_PURCHASES;
  const refreshPurchasing = useRefreshPurchasing();
  const [changesTarget, setChangesTarget] = useState<PurchaseSummary | null>(null);
  const [addTarget, setAddTarget] = useState<PurchaseSummary | null>(null);
  const [headerTarget, setHeaderTarget] = useState<PurchaseSummary | null>(null);
  const [expiryTarget, setExpiryTarget] = useState<PurchaseLineExpiryTarget | null>(null);
  const [notice, setNotice] = useState<CorrectionNotice | null>(null);

  useEffect(() => {
    if (data.status === "failed") {
      setChangesTarget(null);
      setAddTarget(null);
      setHeaderTarget(null);
      setExpiryTarget(null);
    }
  }, [data.status]);

  function corrected(correction: Correction, purchase: PurchaseSummary) {
    setAddTarget(null);
    setHeaderTarget(null);
    setExpiryTarget(null);
    setNotice({ correction, purchase });
    if (registered) {
      onNoticeDismissed();
    }
    void refreshPurchasing();
  }

  const columns = columnsFor(
    {
      seeChanges: setChangesTarget,
      addLines: (purchase) => {
        setNotice(null);
        setAddTarget(purchase);
      },
      correctHeader: (purchase) => {
        setNotice(null);
        setHeaderTarget(purchase);
      },
      correctExpiry: (target) => {
        setNotice(null);
        setExpiryTarget(target);
      },
    },
    (parentId) => purchases.find((purchase) => purchase.id === parentId),
    canRecordPurchases(access),
  );

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
          <AreaTopBar
            eyebrow="Stock"
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
      {data.status === "loaded" ? (
        <>
          <PurchaseChangesModal
            target={changesTarget}
            services={services}
            onClose={() => setChangesTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <AddPurchaseLinesModal
            target={addTarget}
            access={access}
            productCreationModal={productCreationModal}
            services={services}
            onSaved={(purchase) => corrected("linesAdded", purchase)}
            onClose={() => setAddTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <CorrectPurchaseHeaderModal
            target={headerTarget}
            services={services}
            onSaved={(purchase) => corrected("headerCorrected", purchase)}
            onClose={() => setHeaderTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <CorrectPurchaseLineExpiryModal
            target={expiryTarget}
            services={services}
            onSaved={(purchase) => corrected("expiryCorrected", purchase)}
            onClose={() => setExpiryTarget(null)}
            onSessionEnded={onSessionEnded}
          />
        </>
      ) : null}
      {notice === null ? null : (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          {...CORRECTION_NOTICES[notice.correction](notice.purchase)}
          onDismiss={() => setNotice(null)}
        />
      )}
      {registered && notice === null ? (
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
