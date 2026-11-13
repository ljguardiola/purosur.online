import type {
  AbandonMercadoPagoChargeOutcome,
  AnswerReceiptQuestionOutcome,
  Authorization,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  ChargeSaleWithPaidOrderOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoChargeOutcome,
  NonCashChargeAnswer,
  OpenSale,
  PaymentMethodAvailability,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
  SignInUser,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, PointCardType } from "@purosur/domain";
import { LoadFailure, LoadingPlaceholder, ScaleCard, SearchField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ScanBarcode, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { MercadoPagoChargeKind } from "../platform/core-client";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashChargePanel } from "./cash-charge-panel";
import type { CompletedPayment } from "./charge-completed-modal";
import { ChargeCompletedModal } from "./charge-completed-modal";
import type { ChargeMethod, KeyedChargeMethod } from "./charge-method-availability";
import { chargeMethodAvailability } from "./charge-method-availability";
import { ChargePaymentPanel } from "./charge-payment-panel";
import { CombinedPaymentPanel } from "./combined-payment-panel";
import { OtherChargeMethodsPanel } from "./other-charge-methods-panel";
import type { ShownPointOrder } from "./point-charge-panel";
import { PointChargePanel } from "./point-charge-panel";
import { PointPaymentWaitPanel } from "./point-payment-wait-panel";
import type { ShownQrOrder } from "./qr-charge-panel";
import { QrChargePanel } from "./qr-charge-panel";
import { QrPaymentWaitPanel } from "./qr-payment-wait-panel";
import { RebuiltPaidOrderNotice } from "./rebuilt-paid-order-notice";
import { LockedSaleLines } from "./sale-lines";
import {
  useCurrentSaleQuery,
  usePaymentMethodAvailabilityQuery,
  useRefreshCurrentSale,
  useRefreshPaymentMethodAvailability,
} from "./sales-queries";
import { StandaloneTerminalChargePanel } from "./standalone-terminal-charge-panel";
import { TransferChargePanel } from "./transfer-charge-panel";

type OtherMethodsOrigin = "sale" | "combined";

type Step =
  | { name: "methods" }
  | { name: "other-methods"; origin: OtherMethodsOrigin }
  | { name: "cash" }
  | { name: "transfer"; origin: OtherMethodsOrigin }
  | { name: "standalone-terminal"; origin: OtherMethodsOrigin }
  | { name: "qr"; regenerate?: number }
  | { name: "qr-wait"; order: ShownQrOrder; sale: OpenSale }
  | { name: "point"; cardType: PointCardType }
  | { name: "point-wait"; cardType: PointCardType | null; order: ShownPointOrder; sale: OpenSale }
  | { name: "completed"; payment: CompletedPayment; sale: OpenSale };

function stepOf(method: ChargeMethod, origin: OtherMethodsOrigin = "sale"): Step {
  switch (method) {
    case "CASH":
      return { name: "cash" };
    case "POINT_DEBIT":
      return { name: "point", cardType: "DEBIT" };
    case "POINT_CREDIT":
      return { name: "point", cardType: "CREDIT" };
    case "QR":
      return { name: "qr" };
    case "TRANSFER":
      return { name: "transfer", origin };
    case "STANDALONE_TERMINAL":
      return { name: "standalone-terminal", origin };
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
    ? { name: "point-wait", cardType: charge.card_type, order, sale }
    : { name: "qr-wait", order, sale };
}

export type ChargeScreenProps = {
  sessionId: string;
  method?: ChargeMethod;
  person: SignedInPerson;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  cashCharge: (
    saleId: string,
    tendered: number,
    saleDiscount?: number,
  ) => Promise<CashChargeAnswer>;
  cashChargeAmounts: (
    saleId: string,
    saleDiscount?: number,
  ) => Promise<CashChargeAmountsAnswer | null>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleInCashWithChangeDiscount: (
    saleId: string,
    tendered: number,
    discountAmount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  nonCashCharge: (saleId: string, amount: number) => Promise<NonCashChargeAnswer>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  chargeSaleOnStandaloneTerminal: (
    saleId: string,
    amount: number,
  ) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  chargeSaleWithPaidOrder: (saleId: string) => Promise<ChargeSaleWithPaidOrderOutcome>;
  paymentMethodAvailability: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge: (
    saleId: string,
    charge: MercadoPagoChargeKind,
    amount: number,
  ) => Promise<StartMercadoPagoChargeOutcome>;
  followMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoChargeOutcome>;
  abandonMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoChargeOutcome>;
  receiptPrintStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  answerReceiptQuestion: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  contingencyBackupTicketOfSale: (
    saleId: string,
  ) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  contingencyBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  onSessionInvalid: () => void;
};

export function ChargeScreen({
  sessionId,
  method,
  person,
  lock,
  currentSale,
  cashCharge,
  cashChargeAmounts,
  chargeSaleInCash,
  chargeSaleInCashWithChangeDiscount,
  loadAuthorizers,
  nonCashCharge,
  chargeSaleByTransfer,
  chargeSaleOnStandaloneTerminal,
  chargeSaleWithPaidOrder,
  paymentMethodAvailability,
  startMercadoPagoCharge,
  followMercadoPagoCharge,
  abandonMercadoPagoCharge,
  receiptPrintStatus,
  answerReceiptQuestion,
  contingencyBackupTicketOfSale,
  contingencyBackupTickets,
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
  const [step, setStep] = useState<Step>(
    method === undefined ? { name: "other-methods", origin: "sale" } : { name: "methods" },
  );
  const [notice, setNotice] = useState<{ kind: "cancelled" }>();
  const [preselected, setPreselected] = useState(method);

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
  const choosingMethod = step.name === "methods" || step.name === "other-methods";
  const chargeInProgress = choosingMethod ? chargeable?.mercado_pago_charge_in_progress : undefined;
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
  const paidOrder = sale?.rebuilt_paid_order;
  const paidOrderToApply = paidOrder?.applied === false ? paidOrder : undefined;
  const methods = chargeMethodAvailability(availability);
  const qrMinimum = availability.status === "loaded" ? availability.value.qr_minimum : undefined;
  const pointMinimum =
    availability.status === "loaded" ? availability.value.point_minimum : undefined;
  const preselectedOffered = preselected !== undefined && methods[preselected]?.kind === "offered";
  const waitingForAvailability = !preselectedOffered && availability.status === "loading";
  if (preselected !== undefined && chargeable !== undefined && !waitingForAvailability) {
    setPreselected(undefined);
    const noChargeInProgress = chargeInProgress === undefined || chargeInProgress === null;
    if (
      choosingMethod &&
      noChargeInProgress &&
      paidOrderToApply === undefined &&
      preselected !== undefined &&
      preselectedOffered
    ) {
      setStep(stepOf(preselected));
    }
  }
  const paidOrderNotice =
    paidOrderToApply === undefined || sale === undefined ? null : (
      <RebuiltPaidOrderNotice
        paidOrder={paidOrderToApply}
        apply={() => chargeSaleWithPaidOrder(sale.id)}
        onCompleted={(charge) =>
          setStep({
            name: "completed",
            payment: { method: "PAID_ORDER", orderMethod: paidOrderToApply.method, charge },
            sale,
          })
        }
        onPartiallyPaid={backToMethodsWithBalance}
        onSaleChanged={backToMethodsWithBalance}
        onSaleUnavailable={backToSale}
        onSessionInvalid={onSessionInvalid}
      />
    );

  return (
    <RegisterFrame
      background="subtle"
      rail={<OpenSessionRail lock={lock} current="sale" abilities={person.abilities} />}
      aside={
        sale === undefined ? null : step.name === "cash" ? (
          <CashChargePanel
            saleId={sale.id}
            total={sale.total}
            paid={sale.paid}
            pending={sale.pending}
            subtotal={sale.subtotal}
            discountOffered={sale.sale_discount_refusal === null && sale.lines_lock === null}
            appliedDiscountAmount={sale.sale_discount?.amount ?? null}
            authorizationRequired={sale.sale_discount_authorization_required}
            loadAuthorizers={loadAuthorizers}
            readAmounts={(saleDiscount) =>
              saleDiscount === undefined
                ? cashChargeAmounts(sale.id)
                : cashChargeAmounts(sale.id, saleDiscount)
            }
            readCharge={(tendered, saleDiscount) =>
              saleDiscount === undefined
                ? cashCharge(sale.id, tendered)
                : cashCharge(sale.id, tendered, saleDiscount)
            }
            charge={(tendered) => chargeSaleInCash(sale.id, tendered)}
            chargeWithDiscount={(tendered, discountAmount, authorization) =>
              chargeSaleInCashWithChangeDiscount(sale.id, tendered, discountAmount, authorization)
            }
            onBack={backToSale}
            onCompleted={(charge) =>
              setStep({
                name: "completed",
                payment: { method: "CASH", charge },
                sale: { ...sale, total: charge.total },
              })
            }
            onPartiallyPaid={backToMethodsWithBalance}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "methods" ||
          (step.name === "point" && pointMinimum === undefined) ||
          (step.name === "qr" && qrMinimum === undefined) ? (
          <CombinedPaymentPanel
            total={sale.total}
            payments={sale.payments}
            pending={sale.pending}
            methods={methods}
            cancelledNotice={notice?.kind === "cancelled"}
            paidOrderNotice={paidOrderNotice}
            onChoose={(method: KeyedChargeMethod) => {
              setNotice(undefined);
              setStep(stepOf(method));
            }}
            onChooseOther={() => {
              setNotice(undefined);
              setStep({ name: "other-methods", origin: "combined" });
            }}
          />
        ) : step.name === "other-methods" ? (
          <OtherChargeMethodsPanel
            pending={sale.pending}
            paidOrderNotice={paidOrderNotice}
            onBack={() => (step.origin === "sale" ? backToSale() : setStep({ name: "methods" }))}
            onChoose={(method) => setStep(stepOf(method, step.origin))}
          />
        ) : step.name === "transfer" ? (
          <TransferChargePanel
            saleId={sale.id}
            pending={sale.pending}
            readCharge={(amount) => nonCashCharge(sale.id, amount)}
            charge={(amount) => chargeSaleByTransfer(sale.id, amount)}
            onBack={() => setStep({ name: "other-methods", origin: step.origin })}
            onCompleted={(charge) =>
              setStep({ name: "completed", payment: { method: "TRANSFER", charge }, sale })
            }
            onPartiallyPaid={backToMethodsWithBalance}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "standalone-terminal" ? (
          <StandaloneTerminalChargePanel
            pending={sale.pending}
            charge={(amount) => chargeSaleOnStandaloneTerminal(sale.id, amount)}
            onBack={() => setStep({ name: "other-methods", origin: step.origin })}
            onCompleted={(charge) =>
              setStep({
                name: "completed",
                payment: { method: "STANDALONE_TERMINAL", charge },
                sale,
              })
            }
            onPartiallyPaid={backToMethodsWithBalance}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "point" && pointMinimum !== undefined ? (
          <PointChargePanel
            pending={sale.pending}
            cardType={step.cardType}
            minimum={pointMinimum}
            start={(amount) =>
              startMercadoPagoCharge(sale.id, { method: "POINT", cardType: step.cardType }, amount)
            }
            onChooseAnotherMethod={() => void backToMethodsWithBalance()}
            onOrderShown={(order) =>
              setStep({ name: "point-wait", cardType: step.cardType, order, sale })
            }
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "point-wait" ? (
          <PointPaymentWaitPanel
            order={step.order}
            cardType={step.cardType}
            follow={followMercadoPagoCharge}
            abandon={abandonMercadoPagoCharge}
            onChooseAnotherMethod={() => void backToMethodsWithBalance()}
            onCompleted={(charge) =>
              setStep({
                name: "completed",
                payment: { method: "POINT", cardType: step.cardType, charge },
                sale: step.sale,
              })
            }
            onPartiallyPaid={backToMethodsWithBalance}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "qr" && qrMinimum !== undefined ? (
          <QrChargePanel
            pending={sale.pending}
            {...(step.regenerate === undefined ? {} : { regenerate: step.regenerate })}
            minimum={qrMinimum}
            start={(amount) => startMercadoPagoCharge(sale.id, { method: "QR" }, amount)}
            onChooseAnotherMethod={() => void backToMethodsWithBalance()}
            onOrderShown={(order) => setStep({ name: "qr-wait", order, sale })}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : step.name === "qr-wait" ? (
          <QrPaymentWaitPanel
            order={step.order}
            follow={followMercadoPagoCharge}
            abandon={abandonMercadoPagoCharge}
            onCancelled={() => {
              setNotice({ kind: "cancelled" });
              void backToMethodsWithBalance();
            }}
            onChooseAnotherMethod={() => void backToMethodsWithBalance()}
            onCompleted={(charge) =>
              setStep({ name: "completed", payment: { method: "QR", charge }, sale: step.sale })
            }
            onRegenerate={(amount) => setStep({ name: "qr", regenerate: amount })}
            onPartiallyPaid={backToMethodsWithBalance}
            onSaleUnavailable={backToSale}
            onSessionInvalid={onSessionInvalid}
          />
        ) : (
          <ChargePaymentPanel
            total={sale.total}
            paid={step.name === "completed" ? step.sale.total : sale.paid}
            pending={step.name === "completed" ? 0 : sale.pending}
            {...(step.name === "completed" ? {} : { onBackToSale: backToSale })}
          />
        )
      }
    >
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
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <SearchField
                  label="Producto"
                  disabled
                  placeholder="Escaneá o escribí el nombre"
                  icon={<ScanBarcode />}
                  value=""
                  onChange={() => {}}
                />
              </div>
              <ScaleCard />
            </div>
            <LockedSaleLines lines={sale.lines} label="Líneas bloqueadas" />
          </>
        )}
      </main>
      {step.name === "completed" ? (
        <ChargeCompletedModal
          saleId={step.sale.id}
          payment={step.payment}
          readReceiptStatus={receiptPrintStatus}
          answerReceiptQuestion={answerReceiptQuestion}
          readBackupTicket={contingencyBackupTicketOfSale}
          readBackupTickets={contingencyBackupTickets}
          mayChangePrinter={mayChangePrinter}
          onNewSale={backToSale}
        />
      ) : null}
    </RegisterFrame>
  );
}
