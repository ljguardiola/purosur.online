import type {
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  OpenSale,
} from "@purosur/contracts";
import {
  LoadFailure,
  LoadingPlaceholder,
  OptionCardGroup,
  plural,
  ScreenHeader,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, Landmark, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import type { CompletedCharge } from "./cash-charge-modal";
import { CashChargeModal } from "./cash-charge-modal";
import { ChargePaymentPanel } from "./charge-payment-panel";
import { SaleCompletedModal } from "./sale-completed-modal";
import { useCurrentSaleQuery, useRefreshCurrentSale } from "./sales-queries";
import type { CompletedTransfer } from "./transfer-charge-modal";
import { TransferChargeModal } from "./transfer-charge-modal";

type Step =
  | { name: "methods" }
  | { name: "cash" }
  | { name: "transfer" }
  | { name: "completed"; payment: CompletedPayment; sale: OpenSale };

type CompletedPayment =
  | { method: "CASH"; charge: CompletedCharge }
  | { method: "TRANSFER"; charge: CompletedTransfer };

const METHODS = [
  {
    value: "CASH",
    label: "Efectivo",
    description: "Cargás lo entregado y ves el vuelto",
    icon: <Banknote />,
  },
  {
    value: "TRANSFER",
    label: "Transferencia",
    description: "Confirmás al ver el ingreso en la cuenta del negocio",
    icon: <Landmark />,
  },
] as const;

export type ChargeScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  cashCharge: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
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
  onSessionInvalid,
}: ChargeScreenProps) {
  const navigate = useNavigate();
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const refreshCurrentSale = useRefreshCurrentSale(sessionId, person.user_id);
  const [step, setStep] = useState<Step>({ name: "methods" });

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
  const nothingToCharge =
    answer !== undefined && chargeable === undefined && step.name !== "completed";

  useEffect(() => {
    if (nothingToCharge) {
      void navigate({ to: "/session" });
    }
  }, [nothingToCharge, navigate]);

  const sale = step.name === "completed" ? step.sale : chargeable;
  const lineCount = sale?.lines.length ?? 0;
  const lines = plural(lineCount, { one: "LÍNEA", other: "LÍNEAS" });

  return (
    <div className="flex h-screen w-screen bg-surface-subtle">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="sale"
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
            <OptionCardGroup
              label="Medio de pago"
              options={METHODS}
              value={null}
              onChange={(method) =>
                setStep(method === "CASH" ? { name: "cash" } : { name: "transfer" })
              }
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
      {step.name === "completed" && step.payment.method === "CASH" ? (
        <SaleCompletedModal
          total={step.payment.charge.total}
          tendered={step.payment.charge.tendered}
          change={step.payment.charge.change}
          onNewSale={backToSale}
        />
      ) : null}
      {step.name === "completed" && step.payment.method === "TRANSFER" ? (
        <SaleCompletedModal
          total={step.payment.charge.total}
          method="TRANSFER"
          amount={step.payment.charge.amount}
          onNewSale={backToSale}
        />
      ) : null}
    </div>
  );
}
