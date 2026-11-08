import { purchaseOrderReceiptBodySchema } from "@purosur/contracts";
import { Button, EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileX, PackageX } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { ProductCreationModal } from "../platform/creation-parts";
import { AreaTopBar } from "../shell/area-top-bar";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { purchaseOrderReceiptFormFrom, purchaseOrderReceiptRequestFrom } from "./purchase-form";
import type { ReceivePurchaseOrderOutcome } from "./purchase-order-receipts-api";
import type { PurchaseOrderReceiveScreenServices } from "./purchase-order-receive-services";
import { PURCHASE_ORDER_RECEIVED_STATE } from "./purchase-order-received-state";
import { PurchaseRegistrationForm, type PurchaseSubmitOutcome } from "./purchase-registration-form";
import { useReviewPurchasedPrices } from "./purchased-prices-review";
import { usePurchaseChoicesQuery, usePurchaseOrderReceiptDraftQuery } from "./purchasing-queries";

export type PurchaseOrderReceiveScreenProps = {
  orderId: string;
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  onSessionEnded: () => void;
  services: PurchaseOrderReceiveScreenServices;
};

function refused(title: string, description: string): PurchaseSubmitOutcome {
  return { kind: "refused", title, description };
}

function submitOutcomeOf(outcome: ReceivePurchaseOrderOutcome): PurchaseSubmitOutcome {
  switch (outcome.kind) {
    case "not_found":
      return refused("Este pedido ya no existe", "Volvé a los pedidos para ver los actuales.");
    case "not_receivable":
      return refused(
        "Este pedido ya no se puede recibir",
        "Volvé al pedido para ver su estado actual.",
      );
    case "nothing_ordered_received":
      return refused(
        "Ningún producto cargado estaba en el pedido",
        "Cargá al menos un producto que se haya pedido.",
      );
    case "supplier_not_found":
      return refused(
        "El proveedor del pedido ya no está disponible",
        "No se puede registrar la recepción.",
      );
    case "supplier_inactive":
      return refused(
        "El proveedor del pedido ya no está activo",
        "Reactivalo en Proveedores para registrar la recepción.",
      );
    case "ok":
      return { kind: "ok" };
    default:
      return outcome;
  }
}

export function PurchaseOrderReceiveScreen({
  orderId,
  access,
  productCreationModal,
  onSessionEnded,
  services,
}: PurchaseOrderReceiveScreenProps) {
  const navigate = useNavigate();
  const reviewPurchasedPrices = useReviewPurchasedPrices();
  const draftRead = usePurchaseOrderReceiptDraftQuery({
    orderId,
    fetchPurchaseOrderReceiptDraft: services.fetchPurchaseOrderReceiptDraft,
    onSessionEnded,
  });
  const choices = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    onSessionEnded,
  });
  const backToOrder = () => void navigate({ to: "/purchase-orders/$orderId", params: { orderId } });

  if (draftRead.status === "loaded" && draftRead.value.kind === "found") {
    const { draft } = draftRead.value;
    return (
      <PurchaseRegistrationForm
        access={access}
        productCreationModal={productCreationModal}
        eyebrow="Compras"
        title={`Recibir pedido a ${draft.supplier.name}`}
        submitLabel="Registrar la recepción"
        failureTitle="No se registró la recepción"
        loadingWhat="el formulario de recepción"
        data={choices}
        initialValues={purchaseOrderReceiptFormFrom(draft)}
        supplier={{ kind: "fixed", name: draft.supplier.name }}
        request={{
          schema: purchaseOrderReceiptBodySchema,
          from: purchaseOrderReceiptRequestFrom,
        }}
        submit={async (receipt) =>
          submitOutcomeOf(await services.receivePurchaseOrder(orderId, receipt))
        }
        onSubmitted={(values) => {
          if (reviewPurchasedPrices(values.lines)) {
            return;
          }
          void navigate({
            to: "/purchase-orders/$orderId",
            params: { orderId },
            state: (previous) => ({ ...previous, ...PURCHASE_ORDER_RECEIVED_STATE }),
          });
        }}
        onCancel={backToOrder}
        onSessionEnded={onSessionEnded}
      />
    );
  }

  return (
    <ScreenLayout
      topBar={
        <AreaTopBar
          eyebrow="Compras"
          title="Recibir pedido"
          action={
            <Button variant="text" icon={<ArrowLeft />} onPress={backToOrder}>
              Volver al pedido
            </Button>
          }
        />
      }
      bodyClassName="gap-4 p-6"
    >
      {draftRead.status === "loading" && <LoadingPlaceholder variant="form" fields={6} />}
      {draftRead.status === "failed" && (
        <LoadFailure {...cloudLoadFailure(draftRead, "la recepción")} />
      )}
      {draftRead.status === "loaded" && draftRead.value.kind === "not_found" && (
        <EmptyState icon={<FileX />} title="Este pedido ya no existe" variant="blank" />
      )}
      {draftRead.status === "loaded" && draftRead.value.kind === "not_receivable" && (
        <EmptyState
          icon={<PackageX />}
          title="Este pedido ya no se puede recibir"
          variant="blank"
        />
      )}
    </ScreenLayout>
  );
}
