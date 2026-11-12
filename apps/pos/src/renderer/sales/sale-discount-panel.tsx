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
  Eyebrow,
  FigureStat,
  fieldErrorMessage,
  formatCents,
  formatPercent,
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
import { Check, Percent, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
import { useAuthorization } from "../shell/use-authorization";
import { OTHER_REASON, REQUIRED_REASON_MESSAGE, reasonOptionsOf } from "./adjust-line-form";
import type { SaleDiscountKind } from "./sale-discount-form";
import {
  EMPTY_SALE_DISCOUNT_FORM,
  previewSaleDiscountFrom,
  SALE_DISCOUNT_REASONS,
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

const REASON_OPTIONS = reasonOptionsOf(SALE_DISCOUNT_REASONS);

export type SaleDiscountPanelProps = {
  subtotal: number;
  authorizationRequired: boolean;
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

function focusInput(box: HTMLElement | null) {
  box?.querySelector("input")?.focus();
}

export function SaleDiscountPanel({
  subtotal,
  authorizationRequired,
  loadAuthorizers,
  applySaleDiscount,
  previewSaleDiscount,
  onApplied,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: SaleDiscountPanelProps) {
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
    defaultValues: EMPTY_SALE_DISCOUNT_FORM,
    request: { schema: saleDiscountFormRequestSchema, from: saleDiscountRequestFrom },
    fields: { discount: "value", reason: "otherReason" },
    messages: {
      value: ({ kind }) => saleDiscountValueMessage(kind),
      otherReason: REQUIRED_REASON_MESSAGE,
    },
    onSubmit: async ({ discount, reason }, { showFieldError }) => {
      if (!authorization.ready) {
        authorization.ask();
        return;
      }
      const outcome = await applySaleDiscount(discount, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
      authorization.dismiss();
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

  useEffect(() => {
    focusInput(valueBox.current);
  }, []);

  const previewedDiscount = previewSaleDiscountFrom(typed);
  const preview = useSaleDiscountPreviewQuery({
    subtotal,
    discount: previewedDiscount,
    read: previewSaleDiscount,
  });
  const previewed = preview.status === "loaded" ? preview.value : undefined;
  const previewLoading = previewedDiscount !== undefined && preview.status === "loading";
  const previewShown = previewed?.kind === "preview" ? previewed : undefined;
  const discountLabel =
    previewedDiscount?.kind === "PERCENT"
      ? `Descuento ${formatPercent(previewedDiscount.value)}`
      : "Descuento";

  function changeKind(kind: SaleDiscountKind) {
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
      label="Descuento al total"
      width="wide"
      header={
        <SidePanelTitle
          icon={<Percent />}
          title="Descuento al total"
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
        <FigureStat size="hero" label="TOTAL" loading />
      ) : (
        <FigureStat
          size="hero"
          label="TOTAL"
          value={previewShown === undefined ? NOT_PREVIEWED : formatCents(previewShown.total)}
        />
      )}
      <SummaryRowGroup
        variant="plain"
        rows={[
          { label: "Antes", value: formatCents(subtotal) },
          ...(previewLoading
            ? []
            : [
                {
                  label: discountLabel,
                  value:
                    previewShown === undefined
                      ? NOT_PREVIEWED
                      : `– ${formatCents(previewShown.discount_amount)}`,
                },
              ]),
        ]}
      />
      {preview.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo calcular cómo queda la venta"
          description="Volvé a intentarlo en unos segundos."
          onRetry={preview.retry}
        />
      ) : null}
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (
          <SegmentedControl
            label="Unidad del descuento"
            size="large"
            fullWidth
            options={UNIT_OPTIONS}
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
                  label="DESCUENTO"
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
        {(reason) =>
          reason === OTHER_REASON ? (
            <form.AppField name="otherReason" listeners={{ onChange: () => setNotice(undefined) }}>
              {(field) => (
                <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>
      <AuthorizationModal
        authorization={authorization}
        subtitle="Descuento al total"
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
