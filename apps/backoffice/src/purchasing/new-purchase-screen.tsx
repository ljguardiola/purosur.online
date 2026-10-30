import { parseDate } from "@internationalized/date";
import {
  type PurchaseChoices,
  purchaseRegistrationBodySchema,
  type SupplierSummary,
} from "@purosur/contracts";
import {
  Button,
  Card,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  useRequestForm,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Check, ShieldX, TriangleAlert, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { creatableChoice } from "../platform/creatable-options";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { purchasedProductsToReviewState } from "../platform/purchased-products-to-review";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import { AreaTopBar } from "../shell/area-top-bar";
import { type BackofficeAccess, canManageSuppliers } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
import { NewSupplierModal } from "./new-supplier-modal";
import {
  emptyPurchaseForm,
  PURCHASE_FIELDS,
  PURCHASE_LINE_REFUSALS,
  PURCHASE_RECEIPT_TYPE_REQUIRED,
  PURCHASE_SUPPLIER_INACTIVE,
  PURCHASE_SUPPLIER_NOT_FOUND,
  PURCHASE_SUPPLIER_REQUIRED,
  priceReviewProductIds,
  purchaseDateMessage,
  purchaseLineQuantityRefusal,
  purchaseLinesMessage,
  purchaseNoteMessage,
  purchaseReceiptNumberMessage,
  purchaseRegistrationRequestFrom,
  purchaseSupplierOptions,
  RECEIPT_TYPE_OPTIONS,
  withCreatedSupplier,
} from "./purchase-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import { PURCHASE_REGISTERED_STATE } from "./purchase-registered-state";
import {
  useMarkPurchasingStale,
  usePurchaseChoicesQuery,
  useRefreshPurchasing,
} from "./purchasing-queries";

export type NewPurchaseScreenProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  onSessionEnded: () => void;
  services: NewPurchaseScreenServices;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

const NO_CHOICES: Omit<PurchaseChoices, "today"> = { suppliers: [], products: [], packagings: [] };

export function NewPurchaseScreen({
  access,
  productCreationModal,
  onSessionEnded,
  services,
}: NewPurchaseScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const navigate = useNavigate();
  const refreshPurchasing = useRefreshPurchasing();
  const data = usePurchaseChoicesQuery({
    fetchPurchaseChoices: services.fetchPurchaseChoices,
    onSessionEnded,
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lineRefusals, setLineRefusals] = useState<Record<number, string>>({});
  const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
  const {
    suppliers,
    products: storedProducts,
    packagings,
  } = data.status === "loaded" ? data.value : NO_CHOICES;
  const products = withCreatedProducts(storedProducts, createdProducts);

  const today = data.status === "loaded" ? data.value.today : null;
  const [datedOn, setDatedOn] = useState<string | null>(null);

  const { form, submit, submitting } = useRequestForm({
    defaultValues: emptyPurchaseForm(null),
    request: {
      schema: purchaseRegistrationBodySchema,
      from: (current) => purchaseRegistrationRequestFrom(current, products),
    },
    fields: PURCHASE_FIELDS,
    messages: {
      supplierId: PURCHASE_SUPPLIER_REQUIRED,
      purchasedOn: purchaseDateMessage,
      receiptType: PURCHASE_RECEIPT_TYPE_REQUIRED,
      receiptNumber: purchaseReceiptNumberMessage,
      note: purchaseNoteMessage,
      lines: (current) => purchaseLinesMessage(current, products),
    },
    onSubmit: async (_request, { parsed, values, showWireFieldError, showFieldError }) => {
      setNotice(null);
      setLineRefusals({});
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      const outcome = await services.registerPurchase(parsed);
      if (outcome.kind === "ok") {
        void refreshPurchasing();
        const reviewProducts = priceReviewProductIds(values.lines);
        if (reviewProducts.length > 0) {
          void navigate({
            to: "/prices",
            state: (previous) => ({
              ...previous,
              ...purchasedProductsToReviewState(reviewProducts),
            }),
          });
          return;
        }
        void navigate({
          to: "/purchases",
          state: (previous) => ({ ...previous, ...PURCHASE_REGISTERED_STATE }),
        });
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
      if (outcome.kind === "supplier_not_found" || outcome.kind === "supplier_inactive") {
        showFieldError(
          "supplierId",
          outcome.kind === "supplier_inactive"
            ? PURCHASE_SUPPLIER_INACTIVE
            : PURCHASE_SUPPLIER_NOT_FOUND,
        );
        void refreshPurchasing();
        return;
      }
      if (outcome.kind === "line_refused") {
        setLineRefusals({ [outcome.lineIndex]: PURCHASE_LINE_REFUSALS[outcome.reason] });
        void refreshPurchasing();
        return;
      }
      if (outcome.kind === "validation_failed" && outcome.lineIndex !== undefined) {
        setLineRefusals({
          [outcome.lineIndex]: purchaseLineQuantityRefusal(
            values.lines[outcome.lineIndex],
            products,
          ),
        });
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
  const supplierCreation = useStackedCreation<SupplierSummary>(
    (supplier) => form.setFieldValue("supplierId", supplier.id),
    { markStale: markPurchasingStale, refresh: refreshPurchasing },
  );

  useEffect(() => {
    if (today === null || today === datedOn) {
      return;
    }
    if ((form.getFieldValue("purchasedOn")?.toString() ?? null) === datedOn) {
      form.setFieldValue("purchasedOn", parseDate(today), { dontUpdateMeta: true });
    }
    setDatedOn(today);
  }, [today, datedOn, form]);

  const supplierOptions = purchaseSupplierOptions(
    withCreatedSupplier(suppliers, supplierCreation.created),
  );
  const supplierChoice = creatableChoice(
    supplierOptions,
    canManageSuppliers(access)
      ? { recordKind: "proveedor", onCreate: supplierCreation.start }
      : undefined,
  );
  const nothingToChoose = !supplierOptions || products.length === 0;

  return (
    <ScreenLayout
      topBar={
        <AreaTopBar
          eyebrow="Stock"
          title="Registrar compra"
          action={
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={<X />}
                disabled={submitting}
                onPress={() => void navigate({ to: "/purchases" })}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                icon={<Check />}
                dataStatus={data.status}
                disabled={submitting || nothingToChoose}
                onPress={() => void submit()}
              >
                Registrar la compra
              </Button>
            </div>
          }
        />
      }
      bodyClassName="gap-4 p-6"
    >
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={6} />}
      {data.status === "failed" && (
        <LoadFailure {...cloudLoadFailure(data, "el formulario de compra")} />
      )}
      {notice?.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se registró la compra"
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
      {data.status === "loaded" && (
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="text-text-accent text-subheading">Compra</h2>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                {supplierChoice ? (
                  <form.AppField name="supplierId">
                    {(field) => (
                      <field.ComboBox
                        label="Proveedor"
                        placeholder="Elegí un proveedor"
                        required
                        {...supplierChoice}
                      />
                    )}
                  </form.AppField>
                ) : (
                  <EmptyState
                    icon={<Truck />}
                    title="No hay proveedores activos"
                    description="Creá uno en Proveedores para registrar compras."
                    variant="blank"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <form.AppField name="purchasedOn">
                  {(field) => <field.DateField label="Fecha de compra" required />}
                </form.AppField>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <form.AppField name="receiptType">
                  {(field) => (
                    <field.Select
                      label="Tipo de comprobante"
                      placeholder="Elegí un tipo"
                      options={RECEIPT_TYPE_OPTIONS}
                      required
                    />
                  )}
                </form.AppField>
              </div>
              <div className="min-w-0 flex-1">
                <form.AppField name="receiptNumber">
                  {(field) => <field.TextField kind="plain-text" label="Número de comprobante" />}
                </form.AppField>
              </div>
            </div>
            <form.AppField name="note">
              {(field) => <field.TextField kind="plain-text" label="Nota" />}
            </form.AppField>
          </Card>
          <Card>
            <h2 className="text-text-accent text-subheading">Líneas</h2>
            <form.AppField name="lines">
              {() => (
                <PurchaseLinesField
                  access={access}
                  products={products}
                  productCreationModal={productCreationModal}
                  onProductCreated={(product) => setCreatedProducts([...createdProducts, product])}
                  packagings={packagings}
                  refusals={lineRefusals}
                  onLinesChange={() => setLineRefusals({})}
                  services={services}
                  onSessionEnded={onSessionEnded}
                />
              )}
            </form.AppField>
          </Card>
          <NewSupplierModal
            open={supplierCreation.open}
            initialName={supplierCreation.initialName}
            services={services}
            onCreated={supplierCreation.select}
            onClose={supplierCreation.close}
            onSessionEnded={onSessionEnded}
          />
        </div>
      )}
    </ScreenLayout>
  );
}
