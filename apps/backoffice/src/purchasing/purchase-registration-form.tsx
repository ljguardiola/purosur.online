import { parseDate } from "@internationalized/date";
import type { PurchaseChoices, SupplierSummary } from "@purosur/contracts";
import {
  Button,
  Card,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  useRequestForm,
} from "@purosur/ui";
import type { StandardSchemaV1 } from "@tanstack/react-form";
import { Check, ShieldX, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { creatableChoice } from "../platform/creatable-options";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import type { CloudData } from "../platform/use-cloud-query";
import { AreaTopBar } from "../shell/area-top-bar";
import { type BackofficeAccess, canManageSuppliers } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { NewSupplierModal, type NewSupplierModalServices } from "./new-supplier-modal";
import {
  PURCHASE_FIELDS,
  PURCHASE_LINE_REFUSALS,
  PURCHASE_RECEIPT_TYPE_REQUIRED,
  PURCHASE_SUPPLIER_INACTIVE,
  PURCHASE_SUPPLIER_NOT_FOUND,
  PURCHASE_SUPPLIER_REQUIRED,
  type PurchaseFormRequest,
  type PurchaseFormValues,
  type PurchaseProducts,
  purchaseDateMessage,
  purchaseLineQuantityRefusal,
  purchaseLinesMessage,
  purchaseNoteMessage,
  purchaseReceiptNumberMessage,
  purchaseSupplierOptions,
  RECEIPT_TYPE_OPTIONS,
  withCreatedSupplier,
} from "./purchase-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import type { RegisterPurchaseOutcome } from "./purchases-api";
import { useMarkPurchasingStale, useRefreshPurchasing } from "./purchasing-queries";

export type PurchaseSubmitOutcome =
  | Exclude<RegisterPurchaseOutcome, { kind: "ok" }>
  | { kind: "ok" }
  | { kind: "refused"; title: string; description: string };

export type PurchaseFormSupplier =
  | { kind: "choose"; services: NewSupplierModalServices }
  | { kind: "fixed"; name: string };

export type PurchaseRegistrationFormProps<Parsed> = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  eyebrow: string;
  title: string;
  submitLabel: string;
  failureTitle: string;
  loadingWhat: string;
  data: CloudData<PurchaseChoices>;
  initialValues: PurchaseFormValues;
  supplier: PurchaseFormSupplier;
  request: {
    schema: StandardSchemaV1<PurchaseFormRequest, Parsed>;
    from: (values: PurchaseFormValues, products: PurchaseProducts) => PurchaseFormRequest;
  };
  submit: (parsed: Parsed) => Promise<PurchaseSubmitOutcome>;
  onSubmitted: (values: PurchaseFormValues) => void;
  onCancel: () => void;
  onSessionEnded: () => void;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "refused"; title: string; description: string };

const NO_CHOICES: Omit<PurchaseChoices, "today"> = { suppliers: [], products: [] };

export function PurchaseRegistrationForm<Parsed>({
  access,
  productCreationModal,
  eyebrow,
  title,
  submitLabel,
  failureTitle,
  loadingWhat,
  data,
  initialValues,
  supplier,
  request,
  submit: submitParsed,
  onSubmitted,
  onCancel,
  onSessionEnded,
}: PurchaseRegistrationFormProps<Parsed>) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lineRefusals, setLineRefusals] = useState<Record<number, string>>({});
  const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
  const { suppliers, products: storedProducts } =
    data.status === "loaded" ? data.value : NO_CHOICES;
  const products = withCreatedProducts(storedProducts, createdProducts);

  const today = data.status === "loaded" ? data.value.today : null;
  const [datedOn, setDatedOn] = useState<string | null>(null);

  const { form, submit, submitting } = useRequestForm({
    defaultValues: initialValues,
    request: {
      schema: request.schema,
      from: (current) => request.from(current, products),
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
      const outcome = await submitParsed(parsed);
      if (outcome.kind === "ok") {
        void refreshPurchasing();
        onSubmitted(values);
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
      if (outcome.kind === "refused") {
        setNotice(outcome);
        void refreshPurchasing();
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
    (created) => form.setFieldValue("supplierId", created.id),
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
  const nothingToChoose = (supplier.kind === "choose" && !supplierOptions) || products.length === 0;

  return (
    <ScreenLayout
      topBar={
        <AreaTopBar
          eyebrow={eyebrow}
          title={title}
          action={
            <div className="flex items-center gap-3">
              <Button variant="secondary" icon={<X />} disabled={submitting} onPress={onCancel}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                icon={<Check />}
                dataStatus={data.status}
                disabled={submitting || nothingToChoose}
                onPress={() => void submit()}
              >
                {submitLabel}
              </Button>
            </div>
          }
        />
      }
      bodyClassName="gap-4 p-6"
    >
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={6} />}
      {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, loadingWhat)} />}
      {notice?.kind === "attemptFailed" && (
        <ActionFailureNotice title={failureTitle} description="Volvé a intentarlo." />
      )}
      {notice?.kind === "refused" && (
        <ActionFailureNotice title={notice.title} description={notice.description} />
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
                {supplier.kind === "fixed" ? (
                  <dl>
                    <dt className="text-detail text-text-subtle">Proveedor</dt>
                    <dd>{supplier.name}</dd>
                  </dl>
                ) : supplierChoice ? (
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
                  refusals={lineRefusals}
                  onLinesChange={() => setLineRefusals({})}
                  onSessionEnded={onSessionEnded}
                />
              )}
            </form.AppField>
          </Card>
          {supplier.kind === "choose" && (
            <NewSupplierModal
              open={supplierCreation.open}
              initialName={supplierCreation.initialName}
              services={supplier.services}
              onCreated={supplierCreation.select}
              onClose={supplierCreation.close}
              onSessionEnded={onSessionEnded}
            />
          )}
        </div>
      )}
    </ScreenLayout>
  );
}
