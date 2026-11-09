import type { PurchaseSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  formatNumber,
  Table,
  Toggle,
  useTableModel,
} from "@purosur/ui";
import { deepEqual, useNavigate } from "@tanstack/react-router";
import { Check, History, PackagePlus, Pencil, Plus, SearchX, ShoppingCart } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { ProductCreationModal } from "../platform/creation-parts";
import { formatDisplayDate } from "../platform/display-date";
import { type BackofficeAccess, canRecordPurchases } from "../shell/backoffice-access";
import { AddPurchaseLinesModal } from "./add-purchase-lines-modal";
import { CorrectPurchaseHeaderModal } from "./correct-purchase-header-modal";
import { OpenPurchasePanel } from "./open-purchase-panel";
import { PurchaseChangesModal } from "./purchase-changes-modal";
import type { PurchaseLineCorrection } from "./purchase-panel";
import type { PurchasesListScreenServices } from "./purchases-list-services";
import { PurchasesReportContent } from "./purchases-report-content";
import { usePurchasesQuery, useRefreshPurchasing } from "./purchasing-queries";
import { type SupplierFilter, SupplierFilterButton } from "./purchasing-screen-parts";
import { receiptLabel } from "./receipt-label";
import type { PurchasesListFilters } from "./routes";

export type PurchasesListScreenProps = {
  filters: PurchasesListFilters;
  onFiltersChange: (filters: PurchasesListFilters) => void;
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  registered: boolean;
  onNoticeDismissed: () => void;
  onSessionEnded: () => void;
  openPurchase: string | undefined;
  onOpenPurchaseChange: (purchaseId: string | undefined) => void;
  services: PurchasesListScreenServices;
  supplierFilter?: SupplierFilter | undefined;
};

const NO_PURCHASES: PurchaseSummary[] = [];

type Correction = "linesAdded" | "headerCorrected" | PurchaseLineCorrection;

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
  costCorrected: () => ({
    title: "Costo corregido",
    description:
      "El stock que queda de la compra usa el costo corregido; las ventas ya hechas conservan el suyo.",
  }),
  quantityCorrected: () => ({
    title: "Cantidad corregida",
    description:
      "El stock de la línea sigue la cantidad corregida, salvo que un conteo posterior ya la haya contado.",
  }),
  productChanged: () => ({
    title: "Producto cambiado",
    description: "El lote de la línea pasó al producto nuevo, con sus unidades.",
  }),
  lineRemoved: () => ({
    title: "Producto quitado",
    description: "Sus unidades ya no cuentan en el stock.",
  }),
  expiryCorrected: () => ({
    title: "Vencimiento corregido",
    description: "Las alertas y los listados usan la fecha corregida.",
  }),
  expirySplit: () => ({
    title: "Vencimiento corregido",
    description: "Las unidades elegidas quedaron en un lote con la fecha corregida.",
  }),
} satisfies Record<
  Correction,
  (purchase: PurchaseSummary) => { title: string; description: string }
>;

type RowActions = {
  seeChanges: (purchase: PurchaseSummary) => void;
  addLines: (purchase: PurchaseSummary) => void;
  correctHeader: (purchase: PurchaseSummary) => void;
};

function purchaseSubject(purchase: PurchaseSummary): string {
  return `la compra de ${purchase.supplier.name}`;
}

const dataColumns = [
  dataColumn({
    id: "purchasedOn",
    header: "Fecha",
    render: (purchase: PurchaseSummary) => formatDisplayDate(purchase.purchasedOn),
  }),
  dataColumn({
    id: "supplier",
    header: "Proveedor",
    render: (purchase: PurchaseSummary) => purchase.supplier.name,
  }),
  dataColumn({
    id: "receipt",
    header: "Comprobante",
    render: (purchase: PurchaseSummary) =>
      receiptLabel(purchase.receiptType, purchase.receiptNumber),
  }),
  dataColumn({
    id: "products",
    header: "Productos",
    align: "end",
    render: (purchase: PurchaseSummary) => formatNumber(purchase.lines.length),
  }),
] as const;

function columnsFor(actions: RowActions, mayRecord: boolean) {
  return [
    ...dataColumns,
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (purchase: PurchaseSummary) => ({
          icon: <History />,
          "aria-label": `Ver los cambios de ${purchaseSubject(purchase)}`,
          onPress: () => actions.seeChanges(purchase),
        }),
        (purchase: PurchaseSummary) =>
          mayRecord
            ? {
                icon: <PackagePlus />,
                "aria-label": `Agregar productos a ${purchaseSubject(purchase)}`,
                onPress: () => actions.addLines(purchase),
              }
            : undefined,
        (purchase: PurchaseSummary) =>
          mayRecord
            ? {
                icon: <Pencil />,
                "aria-label": `Corregir los datos de ${purchaseSubject(purchase)}`,
                onPress: () => actions.correctHeader(purchase),
              }
            : undefined,
      ],
    }),
  ] as const;
}

export function PurchasesListScreen({
  filters,
  onFiltersChange,
  access,
  productCreationModal,
  registered,
  onNoticeDismissed,
  onSessionEnded,
  openPurchase,
  onOpenPurchaseChange,
  services,
  supplierFilter,
}: PurchasesListScreenProps) {
  const navigate = useNavigate();
  const [bySupplier, setBySupplier] = useState(filters.bySupplier);
  const reportFilters = useEffectEvent(onFiltersChange);
  const data = usePurchasesQuery({
    supplierId: supplierFilter?.supplierId,
    enabled: !bySupplier,
    fetchPurchases: services.fetchPurchases,
    onSessionEnded,
  });
  const purchases = data.status === "loaded" ? data.value : NO_PURCHASES;
  const refreshPurchasing = useRefreshPurchasing();
  const [changesTarget, setChangesTarget] = useState<PurchaseSummary | null>(null);
  const [addTarget, setAddTarget] = useState<PurchaseSummary | null>(null);
  const [headerTarget, setHeaderTarget] = useState<PurchaseSummary | null>(null);
  const [notice, setNotice] = useState<CorrectionNotice | null>(null);

  useEffect(() => {
    const shown: PurchasesListFilters = { bySupplier, from: filters.from, to: filters.to };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [bySupplier, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setChangesTarget(null);
      setAddTarget(null);
      setHeaderTarget(null);
    }
  }, [data.status]);

  function corrected(correction: Correction, purchase: PurchaseSummary) {
    setAddTarget(null);
    setHeaderTarget(null);
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
    },
    canRecordPurchases(access),
  );

  const table = useTableModel({
    items: purchases,
    id: (purchase) => purchase.id,
    columns,
  });

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle name="bySupplier" checked={bySupplier} onCheckedChange={setBySupplier}>
              Agrupar por proveedor
            </Toggle>
            {supplierFilter === undefined || bySupplier ? null : (
              <SupplierFilterButton
                supplierFilter={supplierFilter}
                services={services}
                onSessionEnded={onSessionEnded}
              />
            )}
            <div className="ml-auto">
              <Button
                variant="primary"
                icon={<Plus />}
                onPress={() => void navigate({ to: "/purchases/new" })}
              >
                Registrar compra
              </Button>
            </div>
          </div>
          {bySupplier ? (
            <PurchasesReportContent
              filters={{ from: filters.from, to: filters.to }}
              onFiltersChange={(next) => onFiltersChange({ bySupplier, ...next })}
              onSessionEnded={onSessionEnded}
              services={services}
            />
          ) : (
            <Table
              aria-label="Compras"
              table={table}
              onRowPress={(purchase) => onOpenPurchaseChange(purchase.id)}
              rowState={(purchase) => (purchase.id === openPurchase ? "selected" : undefined)}
              {...cloudTableState(data, "las compras")}
              empty={
                supplierFilter === undefined
                  ? {
                      icon: <ShoppingCart />,
                      title: "Todavía no hay compras registradas",
                      variant: "blank",
                    }
                  : {
                      icon: <SearchX />,
                      title: "Sin resultados",
                      description: "Probá con otro proveedor.",
                      variant: "filtered",
                    }
              }
            />
          )}
        </div>
        {bySupplier ? null : (
          <OpenPurchasePanel
            purchases={purchases}
            purchasesAreLoaded={data.status === "loaded" && !data.refreshing}
            openPurchase={openPurchase}
            access={access}
            services={services}
            onClose={() => onOpenPurchaseChange(undefined)}
            onCorrected={corrected}
            onCorrectionStarted={() => setNotice(null)}
            onStale={() => void refreshPurchasing()}
            onSessionEnded={onSessionEnded}
          />
        )}
      </div>
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
