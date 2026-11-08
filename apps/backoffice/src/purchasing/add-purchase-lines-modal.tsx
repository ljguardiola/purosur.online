import {
  type PurchaseChoices,
  type PurchaseSummary,
  purchaseLinesAdditionBodySchema,
} from "@purosur/contracts";
import { Button, Card, LoadFailure, LoadingPlaceholder, Modal, useRequestForm } from "@purosur/ui";
import { Check, PackagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { BackofficeAccess } from "../shell/backoffice-access";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import { purchaseLineRefusalsOf } from "./purchase-form";
import {
  emptyPurchaseLinesAddition,
  PURCHASE_LINES_ADDITION_FIELDS,
  purchaseLinesAdditionMessages,
  purchaseLinesAdditionRequestFrom,
} from "./purchase-lines-addition-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import { useReviewPurchasedPrices } from "./purchased-prices-review";
import type { addPurchaseLines, fetchPurchaseChoices } from "./purchases-api";
import { usePurchaseChoicesQuery, useRefreshPurchasing } from "./purchasing-queries";

export type AddPurchaseLinesModalServices = {
  addPurchaseLines: typeof addPurchaseLines;
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
};

type AddPurchaseLinesModalProps = {
  target: PurchaseSummary | null;
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  services: AddPurchaseLinesModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const NO_PRODUCTS: PurchaseChoices["products"] = [];

export function AddPurchaseLinesModal({
  target,
  access,
  productCreationModal,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: AddPurchaseLinesModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const reviewPurchasedPrices = useReviewPurchasedPrices();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseSummary | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const [lineRefusals, setLineRefusals] = useState<Record<number, string>>({});
  const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
  const choices = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    enabled: open,
    onSessionEnded,
  });
  const products = withCreatedProducts(
    choices.status === "loaded" ? choices.value.products : NO_PRODUCTS,
    createdProducts,
  );

  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: emptyPurchaseLinesAddition(),
    request: {
      schema: purchaseLinesAdditionBodySchema,
      from: (values) => purchaseLinesAdditionRequestFrom(values, products),
    },
    fields: PURCHASE_LINES_ADDITION_FIELDS,
    messages: purchaseLinesAdditionMessages(products),
    onSubmit: async (_request, { parsed, values, showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      setLineRefusals({});
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      const outcome = await services.addPurchaseLines(target.id, parsed);
      if (outcome.kind === "ok") {
        onSaved(outcome.purchase);
        reviewPurchasedPrices(values.lines);
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      const refusals = purchaseLineRefusalsOf(outcome, values.lines, products);
      if (refusals) {
        setLineRefusals(refusals);
        if (outcome.kind === "line_refused") {
          void refreshPurchasing();
        }
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (target) {
      reset(emptyPurchaseLinesAddition());
      setShown(target);
      setNotice(null);
      setLineRefusals({});
      setCreatedProducts([]);
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
      icon={<PackagePlus />}
      context={`Compras · Compra · ${shown?.supplier.name ?? ""}`}
      title="Agregar productos"
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
            Agregar los productos
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se agregaron los productos" />
          {choices.status === "loading" && <LoadingPlaceholder variant="form" fields={3} />}
          {choices.status === "failed" && (
            <LoadFailure {...cloudLoadFailure(choices, "los productos")} />
          )}
          {choices.status === "loaded" && (
            <Card>
              <form.AppField name="lines">
                {() => (
                  <PurchaseLinesField
                    access={access}
                    products={products}
                    productCreationModal={productCreationModal}
                    onProductCreated={(product) =>
                      setCreatedProducts([...createdProducts, product])
                    }
                    refusals={lineRefusals}
                    onLinesChange={() => setLineRefusals({})}
                    onSessionEnded={onSessionEnded}
                  />
                )}
              </form.AppField>
            </Card>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
