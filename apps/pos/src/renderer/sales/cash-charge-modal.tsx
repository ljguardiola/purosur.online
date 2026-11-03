import type {
  Authorization,
  CashChargeAnswer,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  PreviewSaleDiscountOutcome,
  SaleDiscountRequest,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  Card,
  FigureStat,
  fieldErrorMessage,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  parseAmountCents,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, Banknote, Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import {
  cashChargeRequestFrom,
  chargeSaleInCashRequestSchema,
  EMPTY_CASH_CHARGE_FORM,
  INVALID_AMOUNT_MESSAGE,
  typedChangeDiscount,
} from "./cash-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  PAID_ORDER_NOT_APPLIED_MESSAGE,
} from "./mercado-pago-charge-messages";
import { saleDiscountValueMessage } from "./sale-discount-form";
import { useCashChargeQuery, useSaleDiscountPreviewQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

const DISCOUNT_EXCEEDS_SALE_MESSAGE = "El descuento no puede ser mayor al total de la venta.";
const AUTHORIZING = "descontar sobre el total";
const PERMISSION: AuthorizablePermissionKey = "apply_total_discount";

const PARTIAL_PAYMENT_HINT = "Si no alcanza para saldar la venta, el resto queda pendiente.";

export type CompletedCharge = Extract<ChargeSaleInCashOutcome, { kind: "completed" }>;

export type CashChargeModalProps = {
  saleId: string;
  total: number;
  paid: number;
  pending: number;
  subtotal: number;
  discountOffered: boolean;
  appliedDiscountAmount: number | null;
  authorizationRequired: boolean;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  previewSaleDiscount: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
  readCharge: (tendered: number, saleDiscount?: number) => Promise<CashChargeAnswer>;
  charge: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeWithDiscount: (
    tendered: number,
    discountAmount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedCharge) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function CashChargeModal({
  saleId,
  total,
  paid,
  pending,
  subtotal,
  discountOffered,
  appliedDiscountAmount,
  authorizationRequired,
  person,
  loadAuthorizers,
  previewSaleDiscount,
  readCharge,
  charge,
  chargeWithDiscount,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: CashChargeModalProps) {
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_CASH_CHARGE_FORM,
    request: { schema: chargeSaleInCashRequestSchema, from: cashChargeRequestFrom },
    fields: { tendered: "tendered", discount_amount: "discount" },
    messages: { tendered: INVALID_AMOUNT_MESSAGE, discount: saleDiscountValueMessage("AMOUNT") },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await (request.discount_amount === undefined
        ? charge(request.tendered)
        : chargeWithDiscount(request.tendered, request.discount_amount, authorization.value)
      ).catch((): ChargeSaleInCashWithChangeDiscountOutcome => ({ kind: "unavailable" }));
      switch (outcome.kind) {
        case "completed":
          authorization.performed();
          onCompleted(outcome);
          break;
        case "partially_paid":
          await onPartiallyPaid();
          break;
        case "invalid_amount":
          showFieldError("tendered", INVALID_AMOUNT_MESSAGE);
          break;
        case "discount_exceeds_sale":
          showFieldError("discount", DISCOUNT_EXCEEDS_SALE_MESSAGE);
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
        case "sale_has_payments":
        case "empty_sale":
        case "zero_total":
        case "reaches_buyer_identification_threshold":
        case "no_buyer_identification_threshold":
        case "no_open_sale":
        case "not_permitted":
          onSaleUnavailable();
          break;
        case "not_signed_in":
        case "no_open_session":
          onSessionInvalid();
          break;
        case "mercado_pago_charge_in_progress":
          setNotice(CHARGE_IN_PROGRESS_MESSAGE);
          break;
        case "paid_order_not_applied":
          setNotice(PAID_ORDER_NOT_APPLIED_MESSAGE);
          break;
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  const isBlank = values.tendered.trim() === "";
  const tendered = isBlank ? undefined : parseAmountCents(values.tendered);
  const typedDiscount = typedChangeDiscount(values.discount);
  const discountInvalid = values.discount.trim() !== "" && typedDiscount === undefined;
  const authorization = useAuthorization({
    person,
    permission: PERMISSION,
    required: authorizationRequired && typedDiscount !== undefined,
    loadAuthorizers,
  });
  const answer = useCashChargeQuery({
    saleId,
    pending,
    tendered,
    saleDiscount: typedDiscount,
    read: readCharge,
  });
  const preview = useSaleDiscountPreviewQuery({
    subtotal,
    discount: typedDiscount === undefined ? undefined : { kind: "AMOUNT", value: typedDiscount },
    read: previewSaleDiscount,
  });
  const previewed = preview.status === "loaded" ? preview.value : undefined;
  const previewedTotal = previewed?.kind === "preview" ? previewed : undefined;
  const toCharge = previewedTotal?.total ?? pending;
  const previewLoading = typedDiscount !== undefined && preview.status === "loading";
  const previewFailed = typedDiscount !== undefined && preview.status === "failed";
  const totalShown = typedDiscount === undefined || previewedTotal !== undefined;
  const loaded = answer.status === "loaded" ? answer : undefined;
  const answered =
    loaded === undefined || loaded.value === null || loaded.value === "not_permitted"
      ? undefined
      : loaded.value;
  const saleUnavailable =
    loaded !== undefined && (answered === undefined || answered.kind === "sale_has_payments");
  const discountExceedsSale =
    typedDiscount !== undefined &&
    (answered?.kind === "discount_exceeds_sale" || previewed?.kind === "discount_exceeds_sale");
  const answeredMessage =
    tendered !== undefined && answered?.kind === "invalid_amount"
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  const covered =
    tendered !== undefined &&
    !discountInvalid &&
    answered?.kind === "covered" &&
    totalShown &&
    !loaded?.refreshing
      ? { tendered, ...answered }
      : undefined;
  const rounded = covered !== undefined && covered.cash_rounding > 0 ? covered : undefined;
  const partial =
    tendered !== undefined &&
    !discountInvalid &&
    answered?.kind === "partial" &&
    totalShown &&
    !loaded?.refreshing
      ? answered
      : undefined;

  useEffect(() => {
    if (saleUnavailable) {
      onSaleUnavailable();
    }
  }, [saleUnavailable, onSaleUnavailable]);

  function tenderedMessage(typed: string): string | undefined {
    return typed.trim() !== "" && parseAmountCents(typed) === undefined
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  }

  function discountMessage(typed: string): string | undefined {
    return typed.trim() !== "" && typedChangeDiscount(typed) === undefined
      ? saleDiscountValueMessage("AMOUNT")
      : undefined;
  }

  function handleSubmit() {
    if ((covered === undefined && partial === undefined) || !authorization.ready) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onChooseAnotherMethod();
        }
      }}
      width="standard"
      tone="info"
      icon={<Banknote />}
      context="COBRO EN EFECTIVO"
      contextTone="info"
      title="Ingresá el importe entregado"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onChooseAnotherMethod}
          >
            Cambiar de medio
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            dataStatus={submitting ? "loading" : answer.status}
            disabled={(covered === undefined && partial === undefined) || !authorization.ready}
            onPress={handleSubmit}
          >
            {partial === undefined ? "Completar venta" : "Registrar pago parcial"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          variant="filled"
          orientation="horizontal"
          rows={[
            previewedTotal === undefined
              ? { label: "Total de la venta", value: formatCents(total) }
              : { label: "Después de promociones", value: formatCents(previewedTotal.subtotal) },
            ...(previewedTotal === undefined
              ? []
              : [
                  {
                    label: "Descuento sobre el total",
                    value: `− ${formatCents(previewedTotal.discount_amount)}`,
                    tone: "error" as const,
                  },
                ]),
            { label: "Pagado", value: formatCents(paid) },
            ...(rounded === undefined
              ? [
                  {
                    label: "A cobrar ahora",
                    value: formatCents(toCharge),
                    emphasized: true as const,
                  },
                ]
              : [
                  {
                    label: "Redondeo",
                    value: `− ${formatCents(rounded.cash_rounding)}`,
                    tone: "error" as const,
                  },
                  {
                    label: "A cobrar en efectivo",
                    value: formatCents(rounded.applied),
                    emphasized: true as const,
                  },
                ]),
          ]}
        />
        <form.AppField
          name="tendered"
          validators={{ onChange: ({ value }) => tenderedMessage(value) }}
          listeners={{ onChange: () => setNotice(undefined) }}
        >
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe entregado por el cliente"
              decimals={2}
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              description={PARTIAL_PAYMENT_HINT}
              errorMessage={fieldErrorMessage(field.state.meta.errors) ?? answeredMessage}
            />
          )}
        </form.AppField>
        {discountOffered ? (
          <form.AppField
            name="discount"
            validators={{ onChange: ({ value }) => discountMessage(value) }}
            listeners={{ onChange: () => setNotice(undefined) }}
          >
            {(field) => (
              <TextField
                kind="amount"
                prefix="$"
                label="Descuento por falta de cambio"
                decimals={2}
                value={field.state.value}
                onChange={field.handleChange}
                disabled={submitting}
                errorMessage={
                  fieldErrorMessage(field.state.meta.errors) ??
                  (discountExceedsSale ? DISCOUNT_EXCEEDS_SALE_MESSAGE : undefined)
                }
              />
            )}
          </form.AppField>
        ) : null}
        {discountOffered && appliedDiscountAmount !== null && typedDiscount !== undefined ? (
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            title={`Reemplaza el descuento sobre el total ya aplicado (${formatCents(appliedDiscountAmount)})`}
          />
        ) : null}
        {(tendered !== undefined && answer.status === "loading") || previewLoading ? (
          <LoadingPlaceholder variant="card" lines={2} />
        ) : null}
        {answer.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular el vuelto"
            description="Volvé a intentarlo en unos segundos."
            onRetry={answer.retry}
          />
        ) : null}
        {previewFailed ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular el total con el descuento"
            description="Volvé a intentarlo en unos segundos."
            onRetry={preview.retry}
          />
        ) : null}
        {covered === undefined ? null : (
          <Card variant="subtle">
            <FigureStat
              label="VUELTO A ENTREGAR"
              detail={`${formatCents(covered.tendered)} − ${formatCents(covered.applied)}`}
              value={formatCents(covered.change)}
            />
          </Card>
        )}
        {partial === undefined ? null : (
          <Card variant="subtle">
            <FigureStat
              label="QUEDA PENDIENTE"
              detail={`${formatCents(toCharge)} − ${formatCents(partial.applied)}`}
              value={formatCents(partial.pending)}
            />
          </Card>
        )}
        {discountOffered ? (
          <AuthorizationSection
            authorization={authorization}
            action={AUTHORIZING}
            disabled={submitting}
          />
        ) : null}
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
