import type {
  ApplySaleDiscountOutcome,
  Authorization,
  OpenSale,
  PreviewSaleDiscountOutcome,
  SaleDiscountRequest,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  fieldErrorMessage,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  plural,
  SegmentedControl,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, Check, Percent, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import { REQUIRED_REASON_MESSAGE } from "./adjust-line-form";
import type { SaleDiscountKind } from "./sale-discount-form";
import {
  EMPTY_SALE_DISCOUNT_FORM,
  previewSaleDiscountFrom,
  saleDiscountFormRequestSchema,
  saleDiscountRequestFrom,
  saleDiscountValueMessage,
} from "./sale-discount-form";
import { useSaleDiscountPreviewQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo aplicar el descuento. Probá de nuevo.";
const DISCOUNT_EXCEEDS_SALE_MESSAGE = "El descuento no puede ser mayor al total de la venta.";
const EMPTY_SALE_MESSAGE = "La venta no tiene líneas para descontar.";
const ZERO_TOTAL_MESSAGE = `El total de la venta ya es ${formatCents(0)}: no hay nada para descontar.`;
const AUTHORIZING = "descontar sobre el total";
const PERMISSION: AuthorizablePermissionKey = "apply_total_discount";
const NOT_PREVIEWED = "—";

const UNIT_OPTIONS = [
  { value: "PERCENT", label: "%" },
  { value: "AMOUNT", label: "$" },
] as const;

export type ApplySaleDiscountModalProps = {
  lineCount: number;
  subtotal: number;
  authorizationRequired: boolean;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  applySaleDiscount: (
    discount: SaleDiscountRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ApplySaleDiscountOutcome>;
  previewSaleDiscount: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
  onApplied: (sale: OpenSale) => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

function valueLabel(kind: SaleDiscountKind): string {
  return kind === "PERCENT" ? "Porcentaje de descuento" : "Monto de descuento";
}

export function ApplySaleDiscountModal({
  lineCount,
  subtotal,
  authorizationRequired,
  person,
  loadAuthorizers,
  applySaleDiscount,
  previewSaleDiscount,
  onApplied,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: ApplySaleDiscountModalProps) {
  const [notice, setNotice] = useState<string>();
  const authorization = useAuthorization({
    person,
    permission: PERMISSION,
    required: authorizationRequired,
    loadAuthorizers,
  });
  const {
    form,
    submit,
    submitting,
    clearFieldError,
    values: typed,
  } = useRequestForm({
    defaultValues: EMPTY_SALE_DISCOUNT_FORM,
    request: { schema: saleDiscountFormRequestSchema, from: saleDiscountRequestFrom },
    fields: { discount: "value", reason: "reason" },
    messages: {
      value: ({ kind }) => saleDiscountValueMessage(kind),
      reason: REQUIRED_REASON_MESSAGE,
    },
    onSubmit: async ({ discount, reason }, { showFieldError }) => {
      const outcome = await applySaleDiscount(discount, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
      if (outcome === "failed") {
        setNotice(FAILED_MESSAGE);
        return;
      }
      switch (outcome.kind) {
        case "applied":
          authorization.performed();
          onApplied(outcome.sale);
          break;
        case "discount_exceeds_sale":
          showFieldError("value", DISCOUNT_EXCEEDS_SALE_MESSAGE);
          break;
        case "empty_sale":
          setNotice(EMPTY_SALE_MESSAGE);
          break;
        case "zero_total":
          setNotice(ZERO_TOTAL_MESSAGE);
          break;
        case "no_open_sale":
        case "sale_has_payments":
          onSaleGone();
          break;
        case "not_signed_in":
        case "no_open_session":
          onSessionInvalid();
          break;
        case "not_permitted":
          setNotice("No tenés el permiso de vender y cobrar");
          break;
        case "wrong_pin":
        case "rate_limited":
        case "locked":
        case "lacks_permission":
          if (authorization.required) {
            authorization.refuse(outcome);
          } else if (outcome.kind === "lacks_permission") {
            setNotice(`Ya no tenés permiso para ${AUTHORIZING}.`);
          } else {
            setNotice(FAILED_MESSAGE);
          }
          break;
      }
    },
  });

  const previewedDiscount = previewSaleDiscountFrom(typed);
  const preview = useSaleDiscountPreviewQuery({
    subtotal,
    discount: previewedDiscount,
    read: previewSaleDiscount,
  });
  const previewed = preview.status === "loaded" ? preview.value : undefined;
  const previewLoading = previewedDiscount !== undefined && preview.status === "loading";
  const previewRowsShown = !previewLoading && preview.status !== "failed";

  function changeKind(kind: SaleDiscountKind) {
    form.setFieldValue("kind", kind);
    form.setFieldValue("value", "");
    clearFieldError("value");
  }

  function handleSubmit() {
    if (submitting || !authorization.ready) {
      return;
    }
    setNotice(undefined);
    clearFieldError("value");
    clearFieldError("reason");
    void submit();
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Percent />}
      context={`VENTA EN CURSO · ${lineCount} ${plural(lineCount, { one: "LÍNEA", other: "LÍNEAS" })}`}
      title="Descuento sobre el total"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onClose}
          >
            Volver
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            disabled={submitting || !authorization.ready}
            onPress={handleSubmit}
          >
            Aplicar el descuento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <div className="flex items-center gap-4">
              <SegmentedControl
                label="Unidad del descuento"
                options={UNIT_OPTIONS}
                value={kind}
                onChange={changeKind}
              />
              <form.AppField name="value" listeners={{ onChange: () => setNotice(undefined) }}>
                {(field) => (
                  <TextField
                    kind="discount"
                    label={valueLabel(kind)}
                    labelVisuallyHidden
                    description="Se suma a las promociones y a los descuentos de línea."
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={submitting}
                    errorMessage={
                      fieldErrorMessage(field.state.meta.errors) ??
                      (previewed?.kind === "discount_exceeds_sale"
                        ? DISCOUNT_EXCEEDS_SALE_MESSAGE
                        : undefined)
                    }
                  />
                )}
              </form.AppField>
            </div>
          )}
        </form.Subscribe>
        <form.AppField name="reason" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />}
        </form.AppField>
        {previewRowsShown ? (
          <SummaryRowGroup
            rows={[
              {
                label: "Después de promociones",
                value:
                  previewed?.kind === "preview" ? formatCents(previewed.subtotal) : NOT_PREVIEWED,
                detail: true,
              },
              {
                label: "Descuento sobre el total",
                value:
                  previewed?.kind === "preview"
                    ? `− ${formatCents(previewed.discount_amount)}`
                    : NOT_PREVIEWED,
                detail: true,
                tone: "error",
              },
              {
                label: "Total a cobrar",
                value: previewed?.kind === "preview" ? formatCents(previewed.total) : NOT_PREVIEWED,
                detail: true,
                tone: "info",
              },
            ]}
          />
        ) : null}
        {previewLoading ? <LoadingPlaceholder variant="card" lines={3} /> : null}
        {preview.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular cómo queda la venta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={preview.retry}
          />
        ) : null}
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="Si después cambiás una línea, este descuento se quita y hay que volver a aplicarlo."
        />
        <AuthorizationSection
          authorization={authorization}
          action={AUTHORIZING}
          disabled={submitting}
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
