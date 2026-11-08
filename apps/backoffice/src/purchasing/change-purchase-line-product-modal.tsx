import {
  type PurchaseChoices,
  type PurchaseSummary,
  purchaseLineProductChangeBodySchema,
} from "@purosur/contracts";
import {
  Button,
  EmptyState,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Check, Package, Replace, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import { purchaseProductOptions } from "./purchase-form";
import {
  EMPTY_PURCHASE_LINE_PRODUCT,
  PURCHASE_LINE_PRODUCT_FIELDS,
  purchaseLineProductMessage,
  purchaseLineProductRequestFrom,
} from "./purchase-line-product-form";
import type { changePurchaseLineProduct, fetchPurchaseChoices } from "./purchases-api";
import { usePurchaseChoicesQuery } from "./purchasing-queries";

export type ChangePurchaseLineProductModalServices = {
  changePurchaseLineProduct: typeof changePurchaseLineProduct;
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
};

export type PurchaseLineProductTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type ChangePurchaseLineProductModalProps = {
  target: PurchaseLineProductTarget | null;
  services: ChangePurchaseLineProductModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onStale: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const NO_PRODUCTS: PurchaseChoices["products"] = [];

export function ChangePurchaseLineProductModal({
  target,
  services,
  onSaved,
  onStale,
  onClose,
  onSessionEnded,
}: ChangePurchaseLineProductModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseLineProductTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const choices = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    enabled: open,
    onSessionEnded,
  });
  const productOptions = purchaseProductOptions(
    choices.status === "loaded" ? choices.value.products : NO_PRODUCTS,
  );
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_LINE_PRODUCT,
    request: {
      schema: purchaseLineProductChangeBodySchema,
      from: purchaseLineProductRequestFrom,
    },
    fields: PURCHASE_LINE_PRODUCT_FIELDS,
    messages: { productId: purchaseLineProductMessage },
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.changePurchaseLineProduct(
        target.purchase.id,
        target.line.id,
        request,
      );
      switch (outcome.kind) {
        case "ok":
          onSaved(outcome.purchase);
          return;
        case "unauthenticated":
          onSessionEnded();
          return;
        case "forbidden":
          sendToMyAccount();
          return;
        case "unchanged":
          setNotice({ kind: "unchanged" });
          return;
        case "units_left_lot":
          setNotice({ kind: "unitsLeftTheLineLot" });
          onStale();
          return;
        case "counted_since_receipt":
          setNotice({ kind: "countedSinceReceipt" });
          onStale();
          return;
        case "product_not_found":
          setNotice({ kind: "productNotFound" });
          onStale();
          return;
        case "product_inactive":
          setNotice({ kind: "productInactive" });
          onStale();
          return;
        case "not_found":
          setNotice({ kind: "notFound" });
          return;
        case "validation_failed":
          if (showWireFieldError(outcome.field)) {
            return;
          }
          setNotice({ kind: "attemptFailed" });
          return;
        case "rate_limited":
          setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
          return;
        case "failed":
          setNotice({ kind: "attemptFailed" });
          return;
      }
    },
  });

  useEffect(() => {
    if (target) {
      reset(EMPTY_PURCHASE_LINE_PRODUCT);
      setShown(target);
      setNotice(null);
    }
  }, [target, reset]);

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<Replace />}
      context="Compras · Compra"
      title={shown ? formatProductDescription(shown.line.product) : ""}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={choices.status}
            disabled={submitting}
            onPress={() => void submit()}
          >
            Cambiar el producto
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se cambió el producto" />
          {choices.status === "loading" && <LoadingPlaceholder variant="form" fields={1} />}
          {choices.status === "failed" && (
            <LoadFailure {...cloudLoadFailure(choices, "los productos")} />
          )}
          {choices.status === "loaded" &&
            (productOptions ? (
              <form.AppField name="productId">
                {(field) => (
                  <field.ComboBox
                    label="Producto nuevo"
                    placeholder="Elegí un producto"
                    options={productOptions}
                    required
                  />
                )}
              </form.AppField>
            ) : (
              <EmptyState icon={<Package />} title="No hay productos activos" variant="blank" />
            ))}
        </div>
      ) : null}
    </Modal>
  );
}
