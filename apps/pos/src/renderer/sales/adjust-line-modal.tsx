import type {
  AdjustSaleLineOutcome,
  Authorization,
  ManualAdjustmentRequest,
  OpenSale,
  PreviewSaleLineAdjustmentOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  fieldErrorMessage,
  formatCents,
  formatWeight,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  SegmentedControl,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, Check, Percent, Tag, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import type { AdjustmentKind } from "./adjust-line-form";
import {
  adjustLineFormRequestSchema,
  adjustLineRequestFrom,
  adjustLineValueMessage,
  EMPTY_ADJUST_LINE_FORM,
  previewAdjustmentFrom,
  REQUIRED_REASON_MESSAGE,
} from "./adjust-line-form";
import { useAdjustmentPreviewQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo aplicar el ajuste. Probá de nuevo.";
const SAME_AS_LIST_PRICE_MESSAGE = "Ese es el precio de lista. Ingresá otro precio.";
const DISCOUNT_EXCEEDS_LINE_MESSAGE = "El descuento no puede ser mayor al total de la línea.";
const AUTHORIZING = "cambiar precios o descuentos";
const PERMISSION: AuthorizablePermissionKey = "override_line_price_or_discount";

const MODE_OPTIONS = [
  { value: "DISCOUNT", label: "Descuento", icon: <Percent /> },
  { value: "PRICE", label: "Precio nuevo", icon: <Tag /> },
] as const;

const DISCOUNT_UNIT_OPTIONS = [
  { value: "PERCENT", label: "%" },
  { value: "AMOUNT", label: "$" },
] as const;

const NOT_PREVIEWED = "—";
const REPLACES_PROMOTION_HINT = "Reemplaza la promoción de la línea, si tiene.";

export type AdjustLineModalProps = {
  lineId: string;
  productName: string;
  listUnitPrice: number;
  quantity: number;
  saleUnit: OpenSale["lines"][number]["sale_unit"];
  authorizationRequired: boolean;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  adjustSaleLine: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<AdjustSaleLineOutcome>;
  previewAdjustment: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
  onAdjusted: (sale: OpenSale) => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

function previewRefusalMessage(
  previewed: PreviewSaleLineAdjustmentOutcome | undefined,
): string | undefined {
  switch (previewed?.kind) {
    case "same_as_list_price":
      return SAME_AS_LIST_PRICE_MESSAGE;
    case "discount_exceeds_line":
      return DISCOUNT_EXCEEDS_LINE_MESSAGE;
    default:
      return undefined;
  }
}

function valueLabel(kind: AdjustmentKind): string {
  switch (kind) {
    case "PRICE":
      return "Precio nuevo";
    case "PERCENT":
      return "Porcentaje de descuento";
    case "AMOUNT":
      return "Monto de descuento";
  }
}

export function AdjustLineModal({
  lineId,
  productName,
  listUnitPrice,
  quantity,
  saleUnit,
  authorizationRequired,
  person,
  loadAuthorizers,
  adjustSaleLine,
  previewAdjustment,
  onAdjusted,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: AdjustLineModalProps) {
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
    defaultValues: EMPTY_ADJUST_LINE_FORM,
    request: { schema: adjustLineFormRequestSchema, from: adjustLineRequestFrom },
    fields: { adjustment: "value", reason: "reason" },
    messages: {
      value: ({ kind }) => adjustLineValueMessage(kind),
      reason: REQUIRED_REASON_MESSAGE,
    },
    onSubmit: async ({ adjustment, reason }, { showFieldError }) => {
      const outcome = await adjustSaleLine(lineId, adjustment, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
      if (outcome === "failed") {
        setNotice(FAILED_MESSAGE);
        return;
      }
      switch (outcome.kind) {
        case "changed":
          authorization.performed();
          onAdjusted(outcome.sale);
          break;
        case "same_as_list_price":
          showFieldError("value", SAME_AS_LIST_PRICE_MESSAGE);
          break;
        case "discount_exceeds_line":
          showFieldError("value", DISCOUNT_EXCEEDS_LINE_MESSAGE);
          break;
        case "unknown_line":
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
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  const previewedAdjustment = previewAdjustmentFrom(typed);
  const preview = useAdjustmentPreviewQuery({
    lineId,
    quantity,
    adjustment: previewedAdjustment,
    read: previewAdjustment,
  });
  const previewed = preview.status === "loaded" ? preview.value : undefined;
  const previewLoading = previewedAdjustment !== undefined && preview.status === "loading";
  const previewRowsShown = !previewLoading && preview.status !== "failed";

  function changeKind(kind: AdjustmentKind) {
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
      context={`${productName.toLocaleUpperCase("es-AR")} · ${saleUnit === "KG" ? formatWeight(quantity) : `${quantity} U`}`}
      title="Cambiar el precio de la línea"
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
            <form.Subscribe selector={(state) => state.values.kind}>
              {(kind) => (kind === "PRICE" ? "Aplicar el precio" : "Aplicar el descuento")}
            </form.Subscribe>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <div className="flex items-center justify-between gap-4">
              <SegmentedControl
                label="Tipo de ajuste"
                options={MODE_OPTIONS}
                value={kind === "PRICE" ? "PRICE" : "DISCOUNT"}
                onChange={(mode) => changeKind(mode === "PRICE" ? "PRICE" : "PERCENT")}
              />
              {kind === "PRICE" ? null : (
                <SegmentedControl
                  label="Unidad del descuento"
                  options={DISCOUNT_UNIT_OPTIONS}
                  value={kind}
                  onChange={changeKind}
                />
              )}
            </div>
          )}
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <form.AppField name="value" listeners={{ onChange: () => setNotice(undefined) }}>
              {(field) => (
                <TextField
                  {...(kind === "PERCENT"
                    ? ({ kind: "quantity", suffix: "%" } as const)
                    : ({ kind: "amount", prefix: "$" } as const))}
                  label={valueLabel(kind)}
                  labelVisuallyHidden
                  {...(kind === "PRICE" ? {} : { description: REPLACES_PROMOTION_HINT })}
                  inputMode="numeric"
                  value={field.state.value}
                  onChange={field.handleChange}
                  disabled={submitting}
                  errorMessage={
                    fieldErrorMessage(field.state.meta.errors) ?? previewRefusalMessage(previewed)
                  }
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <SummaryRowGroup
          rows={[
            { label: "Precio de lista", value: formatCents(listUnitPrice) },
            ...(!previewRowsShown || typed.kind === "PRICE"
              ? []
              : [
                  {
                    label: "Descuento",
                    value:
                      previewed?.kind === "preview"
                        ? `− ${formatCents(previewed.discount_amount)}`
                        : NOT_PREVIEWED,
                    tone: "error" as const,
                  },
                ]),
            ...(previewRowsShown
              ? [
                  {
                    label: "Queda la línea en",
                    value:
                      previewed?.kind === "preview"
                        ? formatCents(previewed.line_total)
                        : NOT_PREVIEWED,
                    strong: true,
                    tone: "info" as const,
                  },
                ]
              : []),
          ]}
        />
        {previewLoading ? (
          <LoadingPlaceholder variant="card" lines={typed.kind === "PRICE" ? 1 : 2} />
        ) : null}
        {preview.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular cómo queda la línea"
            description="Volvé a intentarlo en unos segundos."
            onRetry={preview.retry}
          />
        ) : null}
        <form.AppField name="reason" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />}
        </form.AppField>
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
