import { type PurchaseOrderDetail, purchaseOrderEditBodySchema } from "@purosur/contracts";
import { Button, Card, InlineNotice, type LoadStatus, useRequestForm } from "@purosur/ui";
import { Check, ShieldX, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { PurchaseProducts } from "./purchase-form";
import {
  PURCHASE_ORDER_FIELDS,
  purchaseOrderEditRequestFrom,
  purchaseOrderFormValuesOf,
  purchaseOrderLinesMessage,
} from "./purchase-order-form";
import { PurchaseOrderLinesField } from "./purchase-order-lines-field";
import type { editPurchaseOrderLines } from "./purchase-orders-api";
import { useRefreshPurchasing } from "./purchasing-queries";

export type PurchaseOrderDraftFormServices = {
  editPurchaseOrderLines: typeof editPurchaseOrderLines;
};

type PurchaseOrderDraftFormProps = {
  order: PurchaseOrderDetail;
  products: PurchaseProducts;
  productsStatus: LoadStatus;
  services: PurchaseOrderDraftFormServices;
  onSaved: () => void;
  onCancelOrder: () => void;
  onSessionEnded: () => void;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notEditable" }
  | { kind: "notFound" }
  | { kind: "productNotPurchasable" };

export function PurchaseOrderDraftForm({
  order,
  products,
  productsStatus,
  services,
  onSaved,
  onCancelOrder,
  onSessionEnded,
}: PurchaseOrderDraftFormProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const [notice, setNotice] = useState<Notice | null>(null);

  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: purchaseOrderFormValuesOf(order),
    request: { schema: purchaseOrderEditBodySchema, from: purchaseOrderEditRequestFrom },
    fields: PURCHASE_ORDER_FIELDS,
    messages: { lines: purchaseOrderLinesMessage },
    onSubmit: async (_request, { parsed, showWireFieldError }) => {
      setNotice(null);
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      const outcome = await services.editPurchaseOrderLines(order.id, parsed);
      switch (outcome.kind) {
        case "ok":
          reset(purchaseOrderFormValuesOf(outcome.order));
          void refreshPurchasing();
          onSaved();
          return;
        case "unauthenticated":
          onSessionEnded();
          return;
        case "forbidden":
          sendToMyAccount();
          return;
        case "not_editable":
          setNotice({ kind: "notEditable" });
          void refreshPurchasing();
          return;
        case "not_found":
          setNotice({ kind: "notFound" });
          void refreshPurchasing();
          return;
        case "product_not_purchasable":
          setNotice({ kind: "productNotPurchasable" });
          return;
        case "validation_failed":
          if (!showWireFieldError(outcome.field)) {
            setNotice({ kind: "attemptFailed" });
          }
          return;
        case "rate_limited":
          setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
          return;
        case "failed":
          setNotice({ kind: "attemptFailed" });
      }
    },
  });

  return (
    <>
      {notice?.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se guardó el pedido"
          description="Volvé a intentarlo."
        />
      )}
      {notice?.kind === "rateLimited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice?.kind === "notEditable" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este pedido ya no se puede editar"
          description="Actualizamos el pedido con su estado actual."
        />
      )}
      {notice?.kind === "notFound" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este pedido ya no existe"
          description="Volvé a la lista de pedidos."
        />
      )}
      {notice?.kind === "productNotPurchasable" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Un producto del pedido ya no está disponible"
          description="Quitalo del pedido o elegí otro."
        />
      )}
      <Card>
        <h2 className="text-text-accent text-subheading">Líneas</h2>
        <form.AppField name="lines">
          {() => (
            <PurchaseOrderLinesField
              savedLines={order.lines}
              products={products}
              productsStatus={productsStatus}
              onLinesChange={() => setNotice(null)}
            />
          )}
        </form.AppField>
      </Card>
      <div className="flex items-center justify-end gap-3">
        {order.cancellable ? (
          <Button
            variant="secondary"
            destructive
            icon={<Trash2 />}
            disabled={submitting}
            onPress={onCancelOrder}
          >
            Cancelar pedido
          </Button>
        ) : null}
        <Button
          variant="primary"
          icon={<Check />}
          disabled={submitting}
          onPress={() => void submit()}
        >
          Guardar
        </Button>
      </div>
    </>
  );
}
