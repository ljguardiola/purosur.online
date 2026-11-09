import type { PurchaseSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Card,
  DetailPanel,
  dataColumn,
  formatCents,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import {
  BadgeDollarSign,
  CalendarClock,
  CalendarRange,
  Replace,
  Scale,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { formatDisplayDate } from "../platform/display-date";
import {
  type BackofficeAccess,
  canManageFreights,
  canRecordPurchases,
} from "../shell/backoffice-access";
import { ChangePurchaseLineProductModal } from "./change-purchase-line-product-modal";
import { CorrectPurchaseLineCostModal } from "./correct-purchase-line-cost-modal";
import { CorrectPurchaseLineExpiryModal } from "./correct-purchase-line-expiry-modal";
import { CorrectPurchaseLineQuantityModal } from "./correct-purchase-line-quantity-modal";
import { freightMeansLabel } from "./freight-means-label";
import { costPaidOf, quantityOf, unitCostOf } from "./purchase-line-text";
import type { PurchasePanelServices } from "./purchase-panel-services";
import { receiptLabel } from "./receipt-label";
import { RemovePurchaseLineModal } from "./remove-purchase-line-modal";
import { SplitPurchaseLineExpiryModal } from "./split-purchase-line-expiry-modal";

export type PurchaseLineCorrection =
  | "expiryCorrected"
  | "expirySplit"
  | "costCorrected"
  | "quantityCorrected"
  | "productChanged"
  | "lineRemoved";

export type PurchasePanelProps = {
  purchase: PurchaseSummary;
  access: BackofficeAccess;
  services: PurchasePanelServices;
  onClose: () => void;
  onCorrected: (correction: PurchaseLineCorrection, purchase: PurchaseSummary) => void;
  onCorrectionStarted: () => void;
  onStale: () => void;
  onSessionEnded: () => void;
};

type PurchaseLine = PurchaseSummary["lines"][number];
type PurchaseFreight = PurchaseSummary["freights"][number];

type Correcting = {
  kind: "expiry" | "split" | "cost" | "quantity" | "product" | "removal";
  target: { purchase: PurchaseSummary; line: PurchaseLine };
};

const lineColumns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (line: PurchaseLine) => formatProductDescription(line.product),
  }),
] as const;

const freightColumns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (freight: PurchaseFreight) => formatDisplayDate(freight.date),
  }),
  dataColumn({
    id: "description",
    header: "Descripción",
    render: (freight: PurchaseFreight) => (
      <TableCellText description={freightMeansLabel(freight.means)}>
        {freight.description}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (freight: PurchaseFreight) => (
      <TableCellText strong>{formatCents(freight.amountCents)}</TableCellText>
    ),
  }),
] as const;

function LineFacts({ line }: { line: PurchaseLine }) {
  const facts = [
    { label: "Cantidad", value: quantityOf(line) },
    { label: "Costo pagado", value: costPaidOf(line) },
    { label: "Costo unitario", value: unitCostOf(line) },
    { label: "Lote", value: line.lotName },
    ...(line.expiresOn === null
      ? []
      : [{ label: "Vencimiento", value: formatDisplayDate(line.expiresOn) }]),
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
      {facts.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-detail text-text-subtle">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PurchasePanel({
  purchase,
  access,
  services,
  onClose,
  onCorrected,
  onCorrectionStarted,
  onStale,
  onSessionEnded,
}: PurchasePanelProps) {
  const [correcting, setCorrecting] = useState<Correcting | null>(null);
  const mayRecord = canRecordPurchases(access);

  function correct(kind: Correcting["kind"], line: PurchaseLine) {
    onCorrectionStarted();
    setCorrecting({ kind, target: { purchase, line } });
  }

  function targetOf(kind: Correcting["kind"]) {
    return correcting?.kind === kind ? correcting.target : null;
  }

  function corrected(correction: PurchaseLineCorrection, saved: PurchaseSummary) {
    setCorrecting(null);
    onCorrected(correction, saved);
  }

  function remainingInLotOf(kind: Correcting["kind"]): number {
    const line = correcting?.kind === kind ? correcting.target.line : undefined;
    return line === undefined
      ? 0
      : (purchase.lines.find((candidate) => candidate.id === line.id)?.remainingInLot ??
          line.remainingInLot);
  }

  const correctionsColumn = actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (line: PurchaseLine) => ({
        icon: <BadgeDollarSign />,
        "aria-label": `Corregir el costo de ${formatProductDescription(line.product)}`,
        onPress: () => correct("cost", line),
      }),
      (line: PurchaseLine) => ({
        icon: <Scale />,
        "aria-label": `Corregir la cantidad de ${formatProductDescription(line.product)}`,
        onPress: () => correct("quantity", line),
      }),
      (line: PurchaseLine) => ({
        icon: <CalendarClock />,
        "aria-label": `Corregir el vencimiento de ${formatProductDescription(line.product)}`,
        onPress: () => correct("expiry", line),
      }),
    ],
    menu: (line: PurchaseLine) => [
      {
        label: "Dar otro vencimiento a algunas unidades",
        icon: <CalendarRange />,
        onAction: () => correct("split", line),
      },
      {
        label: "Cambiar el producto",
        icon: <Replace />,
        onAction: () => correct("product", line),
      },
      {
        label: "Quitar de la compra",
        icon: <Trash2 />,
        destructive: true,
        onAction: () => correct("removal", line),
      },
    ],
  });

  const linesTable = useTableModel({
    items: purchase.lines,
    id: (line) => line.id,
    columns: mayRecord ? [...lineColumns, correctionsColumn] : lineColumns,
  });
  const freightsTable = useTableModel({
    items: purchase.freights,
    id: (freight) => freight.id,
    columns: freightColumns,
  });

  return (
    <>
      <DetailPanel
        open
        onClose={onClose}
        recordKey={purchase.id}
        title={`Compra a ${purchase.supplier.name}`}
      >
        <div className="flex flex-col gap-4 pt-4">
          <Card>
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              <div>
                <dt className="text-detail text-text-subtle">Proveedor</dt>
                <dd>{purchase.supplier.name}</dd>
              </div>
              <div>
                <dt className="text-detail text-text-subtle">Fecha</dt>
                <dd>{formatDisplayDate(purchase.purchasedOn)}</dd>
              </div>
              <div>
                <dt className="text-detail text-text-subtle">Comprobante</dt>
                <dd>{receiptLabel(purchase.receiptType, purchase.receiptNumber)}</dd>
              </div>
              {purchase.note === null ? null : (
                <div>
                  <dt className="text-detail text-text-subtle">Nota</dt>
                  <dd>{purchase.note}</dd>
                </div>
              )}
            </dl>
          </Card>
          <Table
            aria-label="Productos de la compra"
            variant="nested"
            table={linesTable}
            rowDetail={(line) => <LineFacts line={line} />}
            loading={false}
          />
          {canManageFreights(access) ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-text-accent text-subheading">Fletes vinculados</h2>
              {purchase.freights.length === 0 ? (
                <p className="text-text-subtle">Esta compra no tiene fletes vinculados.</p>
              ) : (
                <Table
                  aria-label="Fletes vinculados"
                  variant="nested"
                  table={freightsTable}
                  loading={false}
                />
              )}
            </section>
          ) : null}
        </div>
      </DetailPanel>
      <CorrectPurchaseLineCostModal
        target={targetOf("cost")}
        services={services}
        onSaved={(saved) => corrected("costCorrected", saved)}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
      <CorrectPurchaseLineQuantityModal
        target={targetOf("quantity")}
        remainingInLot={remainingInLotOf("quantity")}
        services={services}
        onSaved={(saved) => corrected("quantityCorrected", saved)}
        onLotChanged={onStale}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
      <CorrectPurchaseLineExpiryModal
        target={targetOf("expiry")}
        services={services}
        onSaved={(saved) => corrected("expiryCorrected", saved)}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
      <SplitPurchaseLineExpiryModal
        target={targetOf("split")}
        remainingInLot={remainingInLotOf("split")}
        services={services}
        onSaved={(saved) => corrected("expirySplit", saved)}
        onLotChanged={onStale}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
      <ChangePurchaseLineProductModal
        target={targetOf("product")}
        services={services}
        onSaved={(saved) => corrected("productChanged", saved)}
        onStale={onStale}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
      <RemovePurchaseLineModal
        target={targetOf("removal")}
        services={services}
        onRemoved={(saved) => corrected("lineRemoved", saved)}
        onStale={onStale}
        onClose={() => setCorrecting(null)}
        onSessionEnded={onSessionEnded}
      />
    </>
  );
}
