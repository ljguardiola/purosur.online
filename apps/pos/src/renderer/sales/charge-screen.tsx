import type {
  AbandonMercadoPagoChargeOutcome,
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoChargeOutcome,
  OpenSale,
  PaymentMethodAvailability,
  ReceiptPrintStatusOutcome,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import {
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  OptionCardGroup,
  plural,
  ScreenHeader,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Info, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { MercadoPagoMethod } from "../platform/core-client";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashChargeModal } from "./cash-charge-modal";
import type { CompletedPayment } from "./charge-completed-modal";
import { ChargeCompletedModal } from "./charge-completed-modal";
import type { ChargeMethod } from "./charge-method-options";
import { chargeMethodOptions } from "./charge-method-options";
import { ChargePaymentPanel } from "./charge-payment-panel";
import type { ShownPointOrder } from "./point-charge-modal";
import { PointChargeModal } from "./point-charge-modal";
import { PointPaymentWaitModal } from "./point-payment-wait-modal";
import type { ShownQrOrder } from "./qr-charge-modal";
import { QrChargeModal } from "./qr-charge-modal";
import { QrPaymentWaitModal } from "./qr-payment-wait-modal";
import {
  useCurrentSaleQuery,
  usePaymentMethodAvailabilityQuery,
  useRefreshCurrentSale,
  useRefreshPaymentMethodAvailability,
} from "./sales-queries";
import { TransferChargeModal } from "./transfer-charge-modal";

type Step =
  | { name: "methods" }
  | { name: "cash" }
  | { name: "transfer" }
  | { name: "qr" }
  | { name: "qr-wait"; order: ShownQrOrder; sale: OpenSale }
  | { name: "point" }
  | { name: "point-wait"; order: ShownPointOrder; sale: OpenSale }
  | { name: "completed"; payment: CompletedPayment; sale: OpenSale };

function stepOf(method: ChargeMethod): Step {
  switch (method) {
    case "CASH":
      return { name: "cash" };
    case "POINT":
      return { name: "point" };
    case "QR":
      return { name: "qr" };
    case "TRANSFER":
      return { name: "transfer" };
  }
}

function followedChargeStep(
  sale: OpenSale,
  charge: NonNullable<OpenSale["mercado_pago_charge_in_progress"]>,
): Step {
  const order = {
    kind: "order_shown",
    payment_transaction_id: charge.payment_transaction_id,
    amount: charge.amount,
    remaining_seconds: charge.remaining_seconds,
    wait_seconds: charge.wait_seconds,
  } as const;
  return charge.method === "POINT"
    ? { name: "point-wait", order, sale }
    : { name: "qr-wait", order, sale };
}

export type ChargeScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  cashCharge: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  paymentMethodAvailability: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge: (
    saleId: string,
    method: MercadoPagoMethod,
    amount: number,
  ) => Promise<StartMercadoPagoChargeOutcome>;
  followMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoChargeOutcome>;
  abandonMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoChargeOutcome>;
  receiptPrintStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  onSessionInvalid: () => void;
};

export function ChargeScreen({
  sessionId,
  person,
  registerName,
  lock,
  currentSale,
  cashCharge,
  chargeSaleInCash,
  chargeSaleByTransfer,
  paymentMethodAvailability,
  startMercadoPagoCharge,
  followMercadoPagoCharge,
  abandonMercadoPagoCharge,
  receiptPrintStatus,
  onSessionInvalid,
}: ChargeScreenProps) {
  const navigate = useNavigate();
  const mayChangePrinter = person.abilities.includes("configure_receipt_printer");
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const refreshCurrentSale = useRefreshCurrentSale(sessionId, person.user_id);
  const availability = usePaymentMethodAvailabilityQuery({
    sessionId,
    userId: person.user_id,
    read: paymentMethodAvailability,
  });
  const refreshAvailability = useRefreshPaymentMethodAvailability(sessionId, person.user_id);
  const [step, setStep] = useState<Step>({ name: "methods" });
  const [notice, setNotice] = useState<"cancelled">();

  function backToSale() {
    void navigate({ to: "/session" });
  }

  async function backToMethodsWithBalance() {
    await Promise.all([refreshCurrentSale(), refreshAvailability()]);
    setStep({ name: "methods" });
  }

  const answer = current.status === "loaded" ? current.value : undefined;
  const chargeable =
    answer === undefined ||
    answer === null ||
    answer === "not_permitted" ||
    answer.lines.length === 0 ||
    answer.charge_refusal !== null
      ? undefined
      : answer;
  const chargeInProgress =
    step.name === "methods" ? chargeable?.mercado_pago_charge_in_progress : undefined;
  if (chargeable !== undefined && chargeInProgress !== undefined && chargeInProgress !== null) {
    setStep(followedChargeStep(chargeable, chargeInProgress));
  }
  const saleKept =
    step.name === "completed" || step.name === "qr-wait" || step.name === "point-wait";
  const nothingToCharge = answer !== undefined && chargeable === undefined && !saleKept;

  useEffect(() => {
    if (nothingToCharge) {
      void navigate({ to: "/session" });
    }
  }, [nothingToCharge, navigate]);

  const sale = saleKept ? step.sale : chargeable;
  const { options, belowMinimum } = chargeMethodOptions(availability);
  const pointMinimum =
    availability.status === "loaded" ? availability.value.point_minimum : undefined;
  const lineCount = sale?.lines.length ?? 0;
  const lines = plural(lineCount, { one: "LÍNEA", other: "LÍNEAS" });

  return (
    <div className="flex h-full w-full bg-surface-subtle">
      <OpenSessionRail
        registerName={registerName}
        lock={lock}
        current="sale"
        abilities={person.abilities}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        {current.status === "loading" ? <LoadingPlaceholder variant="list" items={1} /> : null}
        {current.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo cargar la venta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={current.retry}
          />
        ) : null}
        {sale === undefined ? null : (
          <>
            <ScreenHeader
              eyebrow={`COBRO · VENTA DE ${lineCount} ${lines}`}
              title="Elegí el medio de pago"
            />
            {notice === "cancelled" && step.name === "methods" ? (
              <InlineNotice tone="info" icon={<Info />} title="Se canceló la orden QR." />
            ) : null}
            {belowMinimum === undefined ? null : (
              <InlineNotice
                tone="info"
                icon={<Info />}
                title={`Point integrada: no se ofrece para cobrar menos de ${formatCents(belowMinimum)}`}
              />
            )}
            <OptionCardGroup
              label="Medio de pago"
              options={options}
              value={null}
              onChange={(method) => {
                setNotice(undefined);
                setStep(stepOf(method));
              }}
            />
          </>
        )}
      </main>
      {sale === undefined ? null : (
        <ChargePaymentPanel
          total={sale.total}
          paid={step.name === "completed" ? step.sale.total : sale.paid}
          pending={step.name === "completed" ? 0 : sale.pending}
          {...(step.name === "completed" ? {} : { onBackToSale: backToSale })}
        />
      )}
      {sale !== undefined && step.name === "cash" ? (
        <CashChargeModal
          saleId={sale.id}
          total={sale.total}
          paid={sale.paid}
          pending={sale.pending}
          readCharge={(tendered) => cashCharge(sale.id, tendered)}
          charge={(tendered) => chargeSaleInCash(sale.id, tendered)}
          onChooseAnotherMethod={() => setStep({ name: "methods" })}
          onCompleted={(charge) =>
            setStep({ name: "completed", payment: { method: "CASH", charge }, sale })
          }
          onPartiallyPaid={backToMethodsWithBalance}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {sale !== undefined && step.name === "transfer" ? (
        <TransferChargeModal
          total={sale.total}
          paid={sale.paid}
          pending={sale.pending}
          charge={(amount) => chargeSaleByTransfer(sale.id, amount)}
          onChooseAnotherMethod={() => setStep({ name: "methods" })}
          onCompleted={(charge) =>
            setStep({ name: "completed", payment: { method: "TRANSFER", charge }, sale })
          }
          onPartiallyPaid={backToMethodsWithBalance}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {sale !== undefined && step.name === "qr" ? (
        <QrChargeModal
          total={sale.total}
          paid={sale.paid}
          pending={sale.pending}
          start={(amount) => startMercadoPagoCharge(sale.id, "QR", amount)}
          onChooseAnotherMethod={() => void backToMethodsWithBalance()}
          onOrderShown={(order) => setStep({ name: "qr-wait", order, sale })}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {step.name === "qr-wait" ? (
        <QrPaymentWaitModal
          total={step.sale.total}
          paid={step.sale.paid}
          order={step.order}
          follow={followMercadoPagoCharge}
          abandon={abandonMercadoPagoCharge}
          onCancelled={() => {
            setNotice("cancelled");
            void backToMethodsWithBalance();
          }}
          onChooseAnotherMethod={() => void backToMethodsWithBalance()}
          onCompleted={(charge) =>
            setStep({ name: "completed", payment: { method: "QR", charge }, sale: step.sale })
          }
          onPartiallyPaid={backToMethodsWithBalance}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {sale !== undefined && step.name === "point" && pointMinimum !== undefined ? (
        <PointChargeModal
          total={sale.total}
          paid={sale.paid}
          pending={sale.pending}
          minimum={pointMinimum}
          start={(amount) => startMercadoPagoCharge(sale.id, "POINT", amount)}
          onChooseAnotherMethod={() => void backToMethodsWithBalance()}
          onOrderShown={(order) => setStep({ name: "point-wait", order, sale })}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {step.name === "point-wait" ? (
        <PointPaymentWaitModal
          total={step.sale.total}
          paid={step.sale.paid}
          order={step.order}
          follow={followMercadoPagoCharge}
          abandon={abandonMercadoPagoCharge}
          onChooseAnotherMethod={() => void backToMethodsWithBalance()}
          onCompleted={(charge) =>
            setStep({ name: "completed", payment: { method: "POINT", charge }, sale: step.sale })
          }
          onPartiallyPaid={backToMethodsWithBalance}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {step.name === "completed" ? (
        <ChargeCompletedModal
          saleId={step.sale.id}
          payment={step.payment}
          readReceiptStatus={receiptPrintStatus}
          mayChangePrinter={mayChangePrinter}
          onNewSale={backToSale}
        />
      ) : null}
    </div>
  );
}
