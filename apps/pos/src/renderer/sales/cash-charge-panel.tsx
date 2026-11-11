import type {
  Authorization,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { SummaryRowProps } from "@purosur/ui";
import {
  Button,
  Card,
  FigureStat,
  fieldErrorMessage,
  formatAmountInput,
  formatCents,
  HighlightedFigure,
  InlineNotice,
  LoadFailure,
  OtherAmountField,
  parseAmountCents,
  QuickAmountButton,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
  TextField,
  useRequestForm,
  WarningBlock,
} from "@purosur/ui";
import { Banknote, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
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
import { useCashChargeAmountsQuery, useCashChargeQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

const DISCOUNT_EXCEEDS_SALE_MESSAGE = "El descuento no puede ser mayor al total de la venta.";
const AUTHORIZING = "descontar sobre el total";
const PERMISSION: AuthorizablePermissionKey = "apply_total_discount";


const QUICK_AMOUNT_KEYS = ["F6", "F7", "F8", "F9"] as const;

export type CompletedCharge = Extract<ChargeSaleInCashOutcome, { kind: "completed" }>;

export type CashChargePanelProps = {
  saleId: string;
  total: number;
  paid: number;
  pending: number;
  subtotal: number;
  discountOffered: boolean;
  appliedDiscountAmount: number | null;
  authorizationRequired: boolean;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  readAmounts: (saleDiscount?: number) => Promise<CashChargeAmountsAnswer | null>;
  readCharge: (tendered: number, saleDiscount?: number) => Promise<CashChargeAnswer>;
  charge: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeWithDiscount: (
    tendered: number,
    discountAmount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  onBack: () => void;
  onCompleted: (charge: CompletedCharge) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

function focusInput(box: HTMLElement | null) {
  box?.querySelector("input")?.focus();
}

export function CashChargePanel({
  saleId,
  total,
  paid,
  pending,
  subtotal,
  discountOffered,
  appliedDiscountAmount,
  authorizationRequired,
  loadAuthorizers,
  readAmounts,
  readCharge,
  charge,
  chargeWithDiscount,
  onBack,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: CashChargePanelProps) {
  const [notice, setNotice] = useState<string>();
  const [shortageOpen, setShortageOpen] = useState(false);
  const [otherPicked, setOtherPicked] = useState(false);
  const [discountRefused, setDiscountRefused] = useState(false);
  const tenderedBox = useRef<HTMLDivElement>(null);
  const otherBox = useRef<HTMLDivElement>(null);
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
      authorization.dismiss();
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
          setDiscountRefused(true);
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
  const saleAmounts = useCashChargeAmountsQuery({ saleId, pending, read: readAmounts });
  const amountsWithDiscount = useCashChargeAmountsQuery({
    saleId,
    pending,
    saleDiscount: typedDiscount,
    read: readAmounts,
  });
  const ofSaleAnswer = saleAmounts.status === "loaded" ? saleAmounts.value : undefined;
  const ofSale = ofSaleAnswer?.kind === "amounts" ? ofSaleAnswer : undefined;
  const quickAmounts = ofSale?.quick_amounts ?? [];
  const suggestedDiscount = ofSale?.change_discount_option ?? undefined;
  const amounts =
    amountsWithDiscount.status === "loaded" && !amountsWithDiscount.refreshing
      ? amountsWithDiscount.value
      : undefined;
  const settled = amounts?.kind === "amounts" ? amounts : undefined;
  const amountsFailure =
    saleAmounts.status === "failed"
      ? saleAmounts
      : amountsWithDiscount.status === "failed"
        ? amountsWithDiscount
        : undefined;
  const loaded = answer.status === "loaded" ? answer : undefined;
  const answered =
    loaded === undefined || loaded.value === null || loaded.value === "not_permitted"
      ? undefined
      : loaded.value;
  const saleUnavailable =
    ofSaleAnswer === null ||
    (loaded !== undefined && (answered === undefined || answered.kind === "sale_has_payments"));
  const discountExceedsSale =
    typedDiscount !== undefined &&
    (discountRefused ||
      answered?.kind === "discount_exceeds_sale" ||
      amounts?.kind === "discount_exceeds_sale");
  const answeredMessage =
    tendered !== undefined && answered?.kind === "invalid_amount"
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  const covered =
    tendered !== undefined &&
    !discountInvalid &&
    answered?.kind === "covered" &&
    settled !== undefined &&
    !loaded?.refreshing
      ? { tendered, ...answered }
      : undefined;
  const partial =
    tendered !== undefined &&
    !discountInvalid &&
    answered?.kind === "partial" &&
    settled !== undefined &&
    !loaded?.refreshing
      ? answered
      : undefined;
  const optionSelected =
    shortageOpen && !otherPicked && suggestedDiscount !== undefined
      ? typedDiscount === suggestedDiscount
      : false;

  useEffect(() => {
    if (saleUnavailable) {
      onSaleUnavailable();
    }
  }, [saleUnavailable, onSaleUnavailable]);

  useEffect(() => {
    focusInput(tenderedBox.current);
  }, []);

  function tenderedMessage(typed: string): string | undefined {
    return typed.trim() !== "" && parseAmountCents(typed) === undefined
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  }

  const otherMessage =
    otherPicked && values.discount.trim() !== "" && typedDiscount === undefined
      ? saleDiscountValueMessage("AMOUNT")
      : undefined;

  function handleSubmit() {
    if (covered === undefined && partial === undefined) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    setNotice(undefined);
    void submit();
  }

  function pickQuickAmount(index: number) {
    const amount = quickAmounts[index];
    if (amount !== undefined) {
      setNotice(undefined);
      form.setFieldValue("tendered", formatAmountInput(amount));
    }
  }

  function changeDiscount(text: string) {
    setDiscountRefused(false);
    setNotice(undefined);
    form.setFieldValue("discount", text);
  }

  function pickSuggestedDiscount() {
    if (suggestedDiscount !== undefined) {
      setOtherPicked(false);
      changeDiscount(formatAmountInput(suggestedDiscount));
    }
  }

  function pickOther() {
    setOtherPicked(true);
    changeDiscount("");
    focusInput(otherBox.current);
  }

  function openShortage() {
    setShortageOpen(true);
    setOtherPicked(false);
    form.setFieldValue(
      "discount",
      suggestedDiscount === undefined ? "" : formatAmountInput(suggestedDiscount),
    );
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function closeShortage() {
    setShortageOpen(false);
    setOtherPicked(false);
    form.setFieldValue("discount", "");
    focusInput(tenderedBox.current);
  }

  function toggleShortage() {
    if (shortageOpen) {
      closeShortage();
    } else {
      openShortage();
    }
  }

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!submitting) {
          onBack();
        }
      },
    },
    ...QUICK_AMOUNT_KEYS.map((key, index) => ({
      key,
      run: () => pickQuickAmount(index),
      enabled: !shortageOpen && !submitting && quickAmounts[index] !== undefined,
    })),
    { key: "F3", run: toggleShortage, enabled: discountOffered && !submitting },
    { key: "0", run: pickOther, enabled: shortageOpen && !submitting },
  ]);
  useKeys([{ key: "Enter", run: handleSubmit }], { fallback: true });

  const replacesAppliedDiscount = appliedDiscountAmount !== null && typedDiscount !== undefined;
  const rounding = partial === undefined ? settled?.cash_rounding : undefined;

  const summaryRows: [SummaryRowProps, ...SummaryRowProps[]] = [
    replacesAppliedDiscount
      ? { label: "Después de promociones", value: formatCents(subtotal) }
      : { label: "Total", value: formatCents(total) },
    ...(paid > 0 ? [{ label: "Pagado", value: formatCents(paid) }] : []),
    ...(typedDiscount === undefined
      ? []
      : [{ label: "Falta de cambio", value: `– ${formatCents(typedDiscount)}` }]),
    ...(rounding === undefined || rounding === 0
      ? []
      : [{ label: "Redondeo", value: `– ${formatCents(rounding)}` }]),
  ];

  return (
    <SidePanel
      label="Cobro en efectivo"
      width="wide"
      header={
        <SidePanelTitle
          icon={<Banknote />}
          title="Efectivo"
          onClose={submitting ? undefined : onBack}
        />
      }
      footer={
        <>
          {discountOffered && !shortageOpen ? (
            <div className="flex">
              <Button variant="text" keycap="F3" disabled={submitting} onPress={toggleShortage}>
                Falta de cambio
              </Button>
            </div>
          ) : null}
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            iconPosition="start"
            keycap="Enter"
            dataStatus={submitting ? "loading" : answer.status}
            disabled={covered === undefined && partial === undefined}
            onPress={handleSubmit}
          >
            {partial === undefined ? "Cobrar" : "Registrar pago parcial"}
          </Button>
        </>
      }
    >
      {amountsFailure !== undefined || discountExceedsSale ? null : settled === undefined ? (
        <FigureStat size="hero" label="A COBRAR" loading />
      ) : (
        <FigureStat
          size="hero"
          label="A COBRAR"
          value={formatCents(partial === undefined ? settled.amount_to_charge : settled.amount_due)}
        />
      )}
      <SummaryRowGroup rows={summaryRows} />
      <div ref={tenderedBox}>
        <form.AppField
          name="tendered"
          validators={{ onChange: ({ value }) => tenderedMessage(value) }}
          listeners={{ onChange: () => setNotice(undefined) }}
        >
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="RECIBIDO"
              decimals={2}
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors) ?? answeredMessage}
            />
          )}
        </form.AppField>
      </div>
      {shortageOpen ? (
        <WarningBlock
          title="FALTA DE CAMBIO"
          action={
            <Button
              variant="text"
              size="small"
              keycap="F3"
              disabled={submitting}
              onPress={closeShortage}
            >
              Quitar
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {suggestedDiscount === undefined ? null : (
              <QuickAmountButton
                amount={`– ${formatCents(suggestedDiscount)}`}
                selected={optionSelected}
                disabled={submitting}
                onPress={pickSuggestedDiscount}
              />
            )}
            <div ref={otherBox} className="col-start-2">
              <OtherAmountField
                label="Otro"
                prefix="– $"
                placeholder="Otro"
                keyName="0"
                value={otherPicked ? values.discount : ""}
                selected={otherPicked}
                disabled={submitting}
                errorMessage={
                  otherMessage ?? (discountExceedsSale ? DISCOUNT_EXCEEDS_SALE_MESSAGE : undefined)
                }
                onChange={(typed) => {
                  setOtherPicked(true);
                  changeDiscount(typed);
                }}
              />
            </div>
          </div>
        </WarningBlock>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {quickAmounts.slice(0, QUICK_AMOUNT_KEYS.length).map((amount, index) => (
            <QuickAmountButton
              key={amount}
              {...(index === 0 ? { label: "JUSTO" } : {})}
              amount={formatCents(amount)}
              keyName={QUICK_AMOUNT_KEYS[index]}
              selected={tendered === amount}
              disabled={submitting}
              onPress={() => pickQuickAmount(index)}
            />
          ))}
        </div>
      )}
      {discountOffered && replacesAppliedDiscount ? (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title={`Reemplaza el descuento sobre el total ya aplicado (${formatCents(appliedDiscountAmount)})`}
        />
      ) : null}
      {answer.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo calcular el vuelto"
          description="Volvé a intentarlo en unos segundos."
          onRetry={answer.retry}
        />
      ) : null}
      {amountsFailure === undefined ? null : (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo calcular el importe a cobrar"
          description="Volvé a intentarlo en unos segundos."
          onRetry={amountsFailure.retry}
        />
      )}
      {covered === undefined ? null : (
        <HighlightedFigure label="VUELTO" value={formatCents(covered.change)} />
      )}
      {partial === undefined ? null : (
        <Card variant="subtle">
          <FigureStat label="QUEDA PENDIENTE" value={formatCents(partial.pending)} />
        </Card>
      )}
      {discountOffered ? (
        <AuthorizationModal
          authorization={authorization}
          subtitle="Falta de cambio"
          action={AUTHORIZING}
          submitting={submitting}
          onConfirm={handleSubmit}
        />
      ) : null}
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
