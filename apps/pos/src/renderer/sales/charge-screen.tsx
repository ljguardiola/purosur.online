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

type ChargeView =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; sale: OpenSale };

type Step = { name: "methods" } | { name: "cash" } | { name: "completed"; charge: CompletedCharge };

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
  const [view, setView] = useState<ChargeView>({ status: "loading" });
  const [step, setStep] = useState<Step>({ name: "methods" });

  function backToSale() {
    void navigate({ to: "/session" });
  }

  useEffect(() => {
    if (view.status !== "loading") {
      return;
    }
    let current = true;
    currentSale().then(
      (sale) => {
        if (!current) {
          return;
        }
        if (sale === null || sale === "not_permitted" || sale.lines.length === 0) {
          void navigate({ to: "/session" });
          return;
        }
        setView({ status: "ready", sale });
      },
      () => {
        if (current) {
          setView({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [view.status, currentSale, navigate]);

  const sale = view.status === "ready" ? view.sale : undefined;
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
        {view.status === "loading" ? <LoadingPlaceholder variant="list" items={1} /> : null}
        {view.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo cargar la venta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={() => setView({ status: "loading" })}
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
          onCompleted={(charge) => setStep({ name: "completed", charge })}
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
