import { type PackagingSummary, packagingCreationBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { Button, EmptyState, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, Package, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import { quantityFieldKind } from "../platform/stock-quantity";
import {
  EMPTY_PACKAGING_FORM,
  PACKAGING_CREATION_FIELDS,
  PACKAGING_NAME_TAKEN,
  PACKAGING_PRODUCT_NOT_FOUND,
  PACKAGING_PRODUCT_REQUIRED,
  type PackagingProduct,
  packagingCreationRequestFrom,
  packagingNameMessage,
  packagingProductLabel,
  packagingProductOptions,
  packagingQuantityMessage,
} from "./packaging-form";
import type { createPackaging } from "./packagings-api";
import { useMarkPurchasingStale, useRefreshPurchasing } from "./purchasing-queries";

export type NewPackagingModalServices = {
  createPackaging: typeof createPackaging;
};

type NewPackagingModalProps = {
  open: boolean;
  products: PackagingProduct[];
  productId?: string;
  productCreationModal?: ProductCreationModal | undefined;
  initialName?: string;
  context?: string;
  services: NewPackagingModalServices;
  onCreated: (packaging: PackagingSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function NewPackagingModal({
  open,
  products,
  productId,
  productCreationModal: ProductCreation,
  initialName = "",
  context = "Stock · Presentaciones de compra",
  services,
  onCreated,
  onClose,
  onSessionEnded,
}: NewPackagingModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const [notice, setNotice] = useState<Notice | null>(null);
  const given = products.find((product) => product.id === productId);
  const unitOf = (chosenId: string | null): SaleUnit =>
    offeredProducts.find((product) => product.id === chosenId)?.saleUnit ?? "UNIT";
  const { form, values, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PACKAGING_FORM,
    request: {
      schema: packagingCreationBodySchema,
      from: (current) => packagingCreationRequestFrom(current, unitOf(current.productId)),
    },
    fields: PACKAGING_CREATION_FIELDS,
    messages: {
      productId: PACKAGING_PRODUCT_REQUIRED,
      name: packagingNameMessage,
      quantity: (current) => packagingQuantityMessage(current, unitOf(current.productId)),
    },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await services.createPackaging(request);
      if (outcome.kind === "ok") {
        onCreated(outcome.packaging);
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
      if (outcome.kind === "name_taken") {
        showFieldError("name", PACKAGING_NAME_TAKEN);
        return;
      }
      if (outcome.kind === "product_not_found") {
        showFieldError("productId", PACKAGING_PRODUCT_NOT_FOUND);
        void refreshPurchasing();
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

  const markPurchasingStale = useMarkPurchasingStale();
  const productCreation = useStackedCreation<CreatedProduct>(
    (product) => form.setFieldValue("productId", product.id),
    { markStale: markPurchasingStale, refresh: refreshPurchasing },
  );
  const offeredProducts = withCreatedProducts(
    products,
    productCreation.created ? [productCreation.created] : [],
  );
  const closeForm = () => {
    productCreation.finish();
    onClose();
  };

  const seed = useEffectEvent(() => {
    reset({ ...EMPTY_PACKAGING_FORM, productId: productId ?? null, name: initialName });
    productCreation.reset();
  });

  useEffect(() => {
    if (open) {
      seed();
      setNotice(null);
    }
  }, [open]);

  const options = packagingProductOptions(offeredProducts);

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          closeForm();
        }
      }}
      width="standard"
      tone="info"
      icon={<Package />}
      context={context}
      title="Nueva presentación"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={closeForm}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting || !options}
            onPress={() => void submit()}
          >
            Crear la presentación
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se guardó la presentación"
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
        {options ? (
          <>
            {given ? (
              <p className="text-body text-text-subtle">Producto: {packagingProductLabel(given)}</p>
            ) : (
              <form.AppField name="productId">
                {(field) => (
                  <field.ComboBox
                    label="Producto"
                    placeholder="Elegí un producto"
                    options={options}
                    required
                    {...(ProductCreation
                      ? { creation: { recordKind: "producto", onCreate: productCreation.start } }
                      : {})}
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name="name">
              {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
            </form.AppField>
            <form.AppField name="quantity">
              {(field) => (
                <field.TextField
                  {...quantityFieldKind(unitOf(values.productId))}
                  label="Cantidad por presentación"
                  required
                />
              )}
            </form.AppField>
          </>
        ) : (
          <EmptyState
            icon={<Package />}
            title="No hay productos activos"
            description="Creá uno en Productos para definir sus presentaciones."
            variant="blank"
          />
        )}
        {ProductCreation ? (
          <ProductCreation
            open={productCreation.open}
            initialName={productCreation.initialName}
            onCreated={productCreation.select}
            onClose={productCreation.close}
            onSessionEnded={onSessionEnded}
          />
        ) : null}
      </div>
    </Modal>
  );
}
