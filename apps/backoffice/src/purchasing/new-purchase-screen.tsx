import type { CalendarDate } from "@internationalized/date";
import { type PurchaseChoices, purchaseRegistrationBodySchema } from "@purosur/contracts";
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
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { StockTopBar } from "../shell/stock-top-bar";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
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
} from "./purchase-form";
import { PurchaseLinesField } from "./purchase-lines-field";
import { PURCHASE_REGISTERED_STATE } from "./purchase-registered-state";
import { usePurchaseChoicesQuery, useRefreshPurchasing } from "./purchasing-queries";

export type NewPurchaseScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: NewPurchaseScreenServices;
  today: CalendarDate;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

const NO_CHOICES: PurchaseChoices = { suppliers: [], products: [], packagings: [] };

export function NewPurchaseScreen({
  access,
  onSessionEnded,
  services,
  today,
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
  const { suppliers, products, packagings } = data.status === "loaded" ? data.value : NO_CHOICES;

  const { form, submit, submitting } = useRequestForm({
    defaultValues: emptyPurchaseForm(today),
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
          void navigate({ to: "/prices", search: { reviewProducts } });
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

  const supplierOptions = purchaseSupplierOptions(suppliers);
  const nothingToChoose = !supplierOptions || products.length === 0;

  return (
    <ScreenLayout
      topBar={
        <StockTopBar
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
                {supplierOptions ? (
                  <form.AppField name="supplierId">
                    {(field) => (
                      <field.ComboBox
                        label="Proveedor"
                        placeholder="Elegí un proveedor"
                        options={supplierOptions}
                        required
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
                  packagings={packagings}
                  refusals={lineRefusals}
                  onLinesChange={() => setLineRefusals({})}
                />
              )}
            </form.AppField>
          </Card>
        </div>
      )}
    </ScreenLayout>
  );
}
