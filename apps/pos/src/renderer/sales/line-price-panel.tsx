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
  Eyebrow,
  FigureStat,
  fieldErrorMessage,
  formatCents,
  formatCentsReduction,
  formatNumber,
  formatWeight,
  InlineNotice,
  LoadFailure,
  OptionCardGroup,
  SegmentedControl,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
import { useAuthorization } from "../shell/use-authorization";
import type { AdjustmentKind } from "./adjust-line-form";
import {
  ADJUST_LINE_REASONS,
  adjustLineFormRequestSchema,
  adjustLineRequestFrom,
  adjustLineValueMessage,
  EMPTY_ADJUST_LINE_FORM,
  OTHER_REASON,
  previewAdjustmentFrom,
  REQUIRED_REASON_MESSAGE,
  reasonOptionsOf,
} from "./adjust-line-form";
import { useAdjustmentPreviewQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo aplicar el ajuste. Probá de nuevo.";
const SAME_AS_LIST_PRICE_MESSAGE = "Ese es el precio de lista. Ingresá otro precio.";
const DISCOUNT_EXCEEDS_LINE_MESSAGE = "El descuento no puede ser mayor al total de la línea.";
const AUTHORIZING = "cambiar precios o descuentos";
const PERMISSION: AuthorizablePermissionKey = "override_line_price_or_discount";
const NOT_PREVIEWED = "—";

const MODE_OPTIONS = [
  { value: "PRICE", label: "Precio nuevo" },
  { value: "PERCENT", label: "Descuento %" },
  { value: "AMOUNT", label: "Descuento $" },
] as const;

const REASON_OPTIONS = reasonOptionsOf(ADJUST_LINE_REASONS);

export type LinePricePanelProps = {
  lineId: string;
  productName: string;
  listUnitPrice: number;
  quantity: number;
  lineTotal: number;
  saleUnit: OpenSale["lines"][number]["sale_unit"];
  authorizationRequired: boolean;
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
  onAdjusted: (sale: OpenSale, removedSaleDiscount: boolean) => void;
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

function valueLabel(kind: AdjustmentKind, saleUnit: LinePricePanelProps["saleUnit"]): string {
  if (kind !== "PRICE") {
    return "DESCUENTO";
  }
  return saleUnit === "KG" ? "PRECIO NUEVO POR KG" : "PRECIO NUEVO POR UNIDAD";
}

function focusInput(box: HTMLElement | null) {
  box?.querySelector("input")?.focus();
}

export function LinePricePanel({
  lineId,
  productName,
  listUnitPrice,
  quantity,
  lineTotal,
  saleUnit,
  authorizationRequired,
  loadAuthorizers,
  adjustSaleLine,
  previewAdjustment,
  onAdjusted,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: LinePricePanelProps) {
  const [notice, setNotice] = useState<string>();
  const valueBox = useRef<HTMLDivElement>(null);
  const authorization = useAuthorization({
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
    fields: { adjustment: "value", reason: "otherReason" },
    messages: {
      value: ({ kind }) => adjustLineValueMessage(kind),
      otherReason: REQUIRED_REASON_MESSAGE,
    },
    onSubmit: async ({ adjustment, reason }, { showFieldError }) => {
      if (!authorization.ready) {
        authorization.ask();
        return;
      }
      const outcome = await adjustSaleLine(lineId, adjustment, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
      authorization.dismiss();
      if (outcome === "failed") {
        setNotice(FAILED_MESSAGE);
        return;
      }
      switch (outcome.kind) {
        case "changed":
          authorization.performed();
          onAdjusted(outcome.sale, outcome.removed_sale_discount);
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

  useEffect(() => {
    focusInput(valueBox.current);
  }, []);

  const previewedAdjustment = previewAdjustmentFrom(typed);
  const preview = useAdjustmentPreviewQuery({
    lineId,
    quantity,
    adjustment: previewedAdjustment,
    read: previewAdjustment,
  });
  const previewed = preview.status === "loaded" ? preview.value : undefined;
  const previewLoading = previewedAdjustment !== undefined && preview.status === "loading";
  const previewShown = previewed?.kind === "preview" ? previewed : undefined;

  function changeKind(kind: AdjustmentKind) {
    form.setFieldValue("kind", kind);
    form.setFieldValue("value", "");
    clearFieldError("value");
    setNotice(undefined);
  }

  function handleSubmit() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    clearFieldError("value");
    clearFieldError("otherReason");
    void submit();
  }

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!submitting) {
          onClose();
        }
      },
    },
  ]);
  useKeys([{ key: "Enter", run: handleSubmit }], { fallback: true });

  return (
    <SidePanel
      label="Precio de la línea"
      width="wide"
      header={
        <SidePanelTitle
          icon={<Pencil />}
          title="Precio de la línea"
          locked={authorizationRequired}
          onClose={submitting ? undefined : onClose}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          disabled={submitting}
          onPress={handleSubmit}
        >
          Aplicar
        </Button>
      }
    >
      {previewLoading ? (
        <FigureStat size="hero" label="QUEDA EN" loading />
      ) : (
        <FigureStat
          size="hero"
          label="QUEDA EN"
          value={previewShown === undefined ? NOT_PREVIEWED : formatCents(previewShown.line_total)}
        />
      )}
      <SummaryRowGroup
        variant="plain"
        rows={[
          {
            label: productName,
            value: saleUnit === "KG" ? formatWeight(quantity) : `${formatNumber(quantity)} u`,
          },
          {
            label: "Precio de lista",
            value: `${formatCents(listUnitPrice)} / ${saleUnit === "KG" ? "kg" : "u"}`,
          },
          { label: "Antes", value: formatCents(lineTotal) },
          ...(previewLoading
            ? []
            : [
                {
                  label: "Diferencia",
                  value:
                    previewShown === undefined
                      ? NOT_PREVIEWED
                      : formatCentsReduction(previewShown.line_total_reduction),
                },
              ]),
        ]}
      />
      {preview.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo calcular cómo queda la línea"
          description="Volvé a intentarlo en unos segundos."
          onRetry={preview.retry}
        />
      ) : null}
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (
          <SegmentedControl
            label="Tipo de ajuste"
            size="large"
            fullWidth
            options={MODE_OPTIONS}
            value={kind}
            onChange={changeKind}
          />
        )}
      </form.Subscribe>
      <div ref={valueBox}>
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <form.AppField name="value" listeners={{ onChange: () => setNotice(undefined) }}>
              {(field) => (
                <TextField
                  {...(kind === "PERCENT"
                    ? ({ kind: "quantity", suffix: "%", inputMode: "numeric" } as const)
                    : ({ kind: "amount", prefix: "$", decimals: 2 } as const))}
                  label={valueLabel(kind, saleUnit)}
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
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow text="MOTIVO" />
        <form.AppField name="reasonOption">
          {(field) => (
            <OptionCardGroup
              layout="grid"
              columns={2}
              label="Motivo"
              options={REASON_OPTIONS}
              value={field.state.value}
              onChange={(reason) => {
                field.handleChange(reason);
                setNotice(undefined);
              }}
            />
          )}
        </form.AppField>
      </div>
      <form.Subscribe selector={(state) => state.values.reasonOption}>
        {(reason) => (
          <form.AppField name="otherReason" listeners={{ onChange: () => setNotice(undefined) }}>
            {(field) =>
              reason === OTHER_REASON ? (
                <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />
              ) : null
            }
          </form.AppField>
        )}
      </form.Subscribe>
      <AuthorizationModal
        authorization={authorization}
        subtitle="Cambiar precio o descuento"
        action={AUTHORIZING}
        submitting={submitting}
        onConfirm={handleSubmit}
      />
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
