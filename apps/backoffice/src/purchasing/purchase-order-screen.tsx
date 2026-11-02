import type { PurchaseOrderDetail } from "@purosur/contracts";
import {
  Button,
  Card,
  dataColumn,
  EmptyState,
  FloatingNotification,
  formatCents,
  formatNumber,
  formatSaleUnitQuantity,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { ArrowLeft, Check, FileX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { CancelPurchaseOrderModal } from "./cancel-purchase-order-modal";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-created-day";
import { PurchaseOrderDraftForm } from "./purchase-order-draft-form";
import type { PurchaseOrderScreenServices } from "./purchase-order-services";
import { purchaseOrderStatusOf } from "./purchase-order-status";
import {
  usePurchaseChoicesQuery,
  usePurchaseOrderQuery,
  useRefreshPurchasing,
} from "./purchasing-queries";

export type PurchaseOrderScreenProps = {
  orderId: string;
  onBack: () => void;
  onSessionEnded: () => void;
  services: PurchaseOrderScreenServices;
};

type OrderLine = PurchaseOrderDetail["lines"][number];

type Notice = "saved" | "cancelled";

const NO_PRODUCTS: never[] = [];
const NO_PRICE = "Sin precio de lista";

export function PurchaseOrderScreen({
  orderId,
  onBack,
  onSessionEnded,
  services,
}: PurchaseOrderScreenProps) {
  const data = usePurchaseOrderQuery({
    orderId,
    fetchPurchaseOrder: services.fetchPurchaseOrder,
    onSessionEnded,
  });
  const choices = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    onSessionEnded,
  });
  const refreshPurchasing = useRefreshPurchasing();
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrderDetail | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editRefused, setEditRefused] = useState(false);

  const read = data.status === "loaded" ? data.value : null;
  const order = read?.kind === "found" ? read.order : null;

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (line: OrderLine) => formatProductDescription(line.product),
    }),
    dataColumn({
      id: "packages",
      header: "Paquetes",
      align: "end",
      render: (line: OrderLine) => formatNumber(line.packages),
    }),
    dataColumn({
      id: "quantityPerPackage",
      header: "Cantidad por paquete",
      align: "end",
      render: (line: OrderLine) =>
        formatSaleUnitQuantity(line.quantityPerPackage, line.product.saleUnit),
    }),
    dataColumn({
      id: "price",
      header: "Precio esperado por paquete",
      align: "end",
      render: (line: OrderLine) =>
        line.expectedPackagePriceCents === null
          ? NO_PRICE
          : formatCents(line.expectedPackagePriceCents),
    }),
    dataColumn({
      id: "total",
      header: "Total de la línea",
      align: "end",
      render: (line: OrderLine) => {
        return line.expectedTotalCents === null ? NO_PRICE : formatCents(line.expectedTotalCents);
      },
    }),
  ] as const;

  const table = useTableModel({
    items: order?.lines ?? [],
    id: (line) => line.product.id,
    columns,
  });

  const status = order === null ? null : purchaseOrderStatusOf(order.state);

  return (
    <>
      <ScreenLayout
        topBar={
          <AreaTopBar
            eyebrow="Pedidos"
            title={order === null ? "Pedido" : `Pedido a ${order.supplier.name}`}
            action={
              <Button variant="text" icon={<ArrowLeft />} onPress={onBack}>
                Volver a los pedidos
              </Button>
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
        {data.status === "loading" && <LoadingPlaceholder variant="form" fields={4} />}
        {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "el pedido")} />}
        {read?.kind === "not_found" && (
          <EmptyState icon={<FileX />} title="Este pedido ya no existe" variant="blank" />
        )}
        {editRefused ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este pedido ya no se puede editar"
            description="Actualizamos el pedido con su estado actual."
          />
        ) : null}
        {order !== null && status !== null && (
          <>
            <Card>
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-detail text-text-subtle">Proveedor</dt>
                  <dd>{order.supplier.name}</dd>
                </div>
                <div>
                  <dt className="text-detail text-text-subtle">Fecha de creación</dt>
                  <dd>{formatPurchaseOrderCreatedDay(order.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-detail text-text-subtle">Estado</dt>
                  <dd>
                    <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>
                  </dd>
                </div>
                <div>
                  <dt className="text-detail text-text-subtle">Total esperado</dt>
                  <dd className="flex flex-col">
                    <span>{formatCents(order.expectedTotalCents)}</span>
                    {order.hasUnpricedLine ? (
                      <span className="text-detail text-text-subtle">
                        Hay líneas sin precio de lista
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </Card>
            {order.editable ? (
              <PurchaseOrderDraftForm
                order={order}
                products={choices.status === "loaded" ? choices.value.products : NO_PRODUCTS}
                productsStatus={choices.status}
                services={services}
                onSaved={() => {
                  setEditRefused(false);
                  setNotice("saved");
                }}
                onNotEditable={() => setEditRefused(true)}
                onCancelOrder={() => setCancelTarget(order)}
                onSessionEnded={onSessionEnded}
              />
            ) : (
              <Table aria-label="Líneas del pedido" table={table} loading={false} />
            )}
          </>
        )}
      </ScreenLayout>
      <CancelPurchaseOrderModal
        target={cancelTarget}
        services={services}
        onCancelled={() => {
          setCancelTarget(null);
          setNotice("cancelled");
          void refreshPurchasing();
        }}
        onOutdated={() => {
          setCancelTarget(null);
          void refreshPurchasing();
        }}
        onClose={() => setCancelTarget(null)}
        onSessionEnded={onSessionEnded}
      />
      {notice === null ? null : (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title={notice === "saved" ? "Pedido guardado" : "Pedido cancelado"}
          description={
            notice === "saved" ? "Los cambios quedaron en el borrador." : "Ya no se puede editar."
          }
          onDismiss={() => setNotice(null)}
        />
      )}
    </>
  );
}
