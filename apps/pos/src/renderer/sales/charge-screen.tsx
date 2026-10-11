import type {
  AbandonMercadoPagoQrChargeOutcome,
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoQrChargeOutcome,
  OpenSale,
  ReceiptPrintStatusOutcome,
  RegisterStatus,
  RetryReceiptPrintOutcome,
  StartMercadoPagoQrChargeOutcome,
} from "@purosur/contracts";
import {
  FloatingNotification,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  OptionCardGroup,
  plural,
  ScreenHeader,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  CircleCheck,
  Info,
  Landmark,
  QrCode,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import type { CompletedCharge } from "./cash-charge-modal";
import { CashChargeModal } from "./cash-charge-modal";
import { ChargePaymentPanel } from "./charge-payment-panel";
import type { ShownQrOrder } from "./qr-charge-modal";
import { QrChargeModal } from "./qr-charge-modal";
import type { CompletedQrPayment } from "./qr-payment-wait-modal";
import { QrPaymentWaitModal } from "./qr-payment-wait-modal";
import { SaleCompletedModal } from "./sale-completed-modal";
import { useCurrentSaleQuery, useRefreshCurrentSale } from "./sales-queries";
import type { CompletedTransfer } from "./transfer-charge-modal";
import { TransferChargeModal } from "./transfer-charge-modal";

type Step =
  | { name: "methods" }
  | { name: "cash" }
  | { name: "transfer" }
  | { name: "qr" }
  | { name: "qr-wait"; order: ShownQrOrder; sale: OpenSale }
  | { name: "completed"; payment: CompletedPayment; sale: OpenSale };

type CompletedPayment =
  | { method: "CASH"; charge: CompletedCharge }
  | { method: "TRANSFER"; charge: CompletedTransfer }
  | { method: "QR"; charge: CompletedQrPayment };

const CASH_METHOD = {
  value: "CASH",
  label: "Efectivo",
  description: "Cargás lo entregado y ves el vuelto",
  icon: <Banknote />,
} as const;

const QR_METHOD = {
  value: "QR",
  label: "QR de Mercado Pago",
  description: "El cliente escanea el QR · requiere internet",
  icon: <QrCode />,
} as const;

const QR_METHOD_UNAVAILABLE = {
  value: "QR",
  label: "QR de Mercado Pago",
  description: "No disponible sin conexión",
  icon: <WifiOff />,
  disabled: true,
} as const;

const TRANSFER_METHOD = {
  value: "TRANSFER",
  label: "Transferencia",
  description: "Confirmás al ver el ingreso en la cuenta del negocio",
  icon: <Landmark />,
} as const;

export type ChargeScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  cashCharge: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  registerStatus: CoreData<RegisterStatus>;
  startMercadoPagoQrCharge: (
    saleId: string,
    amount: number,
  ) => Promise<StartMercadoPagoQrChargeOutcome>;
  followMercadoPagoQrCharge: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoQrChargeOutcome>;
  abandonMercadoPagoQrCharge: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoQrChargeOutcome>;
  receiptPrintStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  retryReceiptPrint: (saleId: string) => Promise<RetryReceiptPrintOutcome>;
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
  registerStatus,
  startMercadoPagoQrCharge,
  followMercadoPagoQrCharge,
  abandonMercadoPagoQrCharge,
  receiptPrintStatus,
  retryReceiptPrint,
  onSessionInvalid,
}: ChargeScreenProps) {
  const navigate = useNavigate();
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const refreshCurrentSale = useRefreshCurrentSale(sessionId, person.user_id);
  const [step, setStep] = useState<Step>({ name: "methods" });
  const [notice, setNotice] = useState<"cancelled" | "already-paid">();

  function backToSale() {
    void navigate({ to: "/session" });
  }

  async function backToMethodsWithBalance() {
    await refreshCurrentSale();
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
  const saleKept = step.name === "completed" || step.name === "qr-wait";
  const nothingToCharge = answer !== undefined && chargeable === undefined && !saleKept;

  useEffect(() => {
    if (nothingToCharge) {
      void navigate({ to: "/session" });
    }
  }, [nothingToCharge, navigate]);

  const sale = saleKept ? step.sale : chargeable;
  const qrMethod =
    registerStatus.status !== "loaded"
      ? []
      : [registerStatus.value.cloud === "reachable" ? QR_METHOD : QR_METHOD_UNAVAILABLE];
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
            <OptionCardGroup
              label="Medio de pago"
              options={[CASH_METHOD, ...qrMethod, TRANSFER_METHOD]}
              value={null}
              onChange={(method) => {
                setNotice(undefined);
                setStep(
                  method === "CASH"
                    ? { name: "cash" }
                    : method === "QR"
                      ? { name: "qr" }
                      : { name: "transfer" },
                );
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
          start={(amount) => startMercadoPagoQrCharge(sale.id, amount)}
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
          follow={followMercadoPagoQrCharge}
          abandon={abandonMercadoPagoQrCharge}
          onAlreadyPaid={() => setNotice("already-paid")}
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
      {step.name === "completed" && step.payment.method === "QR" ? (
        <SaleCompletedModal
          saleId={step.sale.id}
          readReceiptStatus={receiptPrintStatus}
          retryReceiptPrint={retryReceiptPrint}
          total={step.payment.charge.total}
          method="QR"
          amount={step.payment.charge.amount}
          onNewSale={backToSale}
        />
      ) : null}
      {step.name === "completed" && step.payment.method === "CASH" ? (
        <SaleCompletedModal
          saleId={step.sale.id}
          readReceiptStatus={receiptPrintStatus}
          retryReceiptPrint={retryReceiptPrint}
          total={step.payment.charge.total}
          tendered={step.payment.charge.tendered}
          change={step.payment.charge.change}
          onNewSale={backToSale}
        />
      ) : null}
      {step.name === "completed" && step.payment.method === "TRANSFER" ? (
        <SaleCompletedModal
          saleId={step.sale.id}
          readReceiptStatus={receiptPrintStatus}
          retryReceiptPrint={retryReceiptPrint}
          total={step.payment.charge.total}
          method="TRANSFER"
          amount={step.payment.charge.amount}
          onNewSale={backToSale}
        />
      ) : null}
      {notice === "already-paid" ? (
        <FloatingNotification
          tone="success"
          icon={<CircleCheck />}
          title="El cliente ya pagó"
          description="Mercado Pago confirmó el pago del QR."
          onDismiss={() => setNotice(undefined)}
        />
      ) : null}
    </div>
  );
}
