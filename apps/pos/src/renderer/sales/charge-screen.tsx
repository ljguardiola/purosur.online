import type { ChargeSaleInCashOutcome, CurrentSaleAnswer, OpenSale } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder, OptionCardGroup, plural } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { Eyebrow } from "../shell/eyebrow";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { CompletedCharge } from "./cash-charge-modal";
import { CashChargeModal } from "./cash-charge-modal";
import { ChargePaymentPanel } from "./charge-payment-panel";
import { SaleCompletedModal } from "./sale-completed-modal";
import { useCurrentSaleQuery } from "./sales-queries";

type Step =
  | { name: "methods" }
  | { name: "cash" }
  | { name: "completed"; charge: CompletedCharge; sale: OpenSale };

const METHODS = [
  {
    value: "CASH",
    label: "Efectivo",
    description: "Cargás lo entregado y ves el vuelto",
    icon: <Banknote />,
  },
] as const;

export type ChargeScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  onSessionInvalid: () => void;
};

export function ChargeScreen({
  person,
  registerName,
  lock,
  currentSale,
  chargeSaleInCash,
  onSessionInvalid,
}: ChargeScreenProps) {
  const navigate = useNavigate();
  const current = useCurrentSaleQuery(currentSale);
  const [step, setStep] = useState<Step>({ name: "methods" });

  function backToSale() {
    void navigate({ to: "/session" });
  }

  const answer = current.status === "loaded" ? current.value : undefined;
  const chargeable =
    answer === undefined ||
    answer === null ||
    answer === "not_permitted" ||
    answer.lines.length === 0
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
            <div className="flex flex-col gap-1.5">
              <Eyebrow text={`COBRO · VENTA DE ${lineCount} ${lines}`} />
              <h1 className="text-display text-text-accent">Elegí el medio de pago</h1>
            </div>
            <OptionCardGroup
              label="Medio de pago"
              options={METHODS}
              value={null}
              onChange={() => setStep({ name: "cash" })}
            />
          </>
        )}
      </main>
      {sale === undefined ? null : (
        <ChargePaymentPanel
          total={sale.total}
          paid={step.name === "completed" ? step.charge.total : 0}
          {...(step.name === "completed" ? {} : { onBackToSale: backToSale })}
        />
      )}
      {sale !== undefined && step.name === "cash" ? (
        <CashChargeModal
          total={sale.total}
          charge={(tendered) => chargeSaleInCash(sale.id, tendered)}
          onChooseAnotherMethod={() => setStep({ name: "methods" })}
          onCompleted={(charge) => setStep({ name: "completed", charge, sale })}
          onSaleUnavailable={backToSale}
          onSessionInvalid={onSessionInvalid}
        />
      ) : null}
      {step.name === "completed" ? (
        <SaleCompletedModal
          total={step.charge.total}
          tendered={step.charge.tendered}
          change={step.charge.change}
          onNewSale={backToSale}
        />
      ) : null}
    </div>
  );
}
