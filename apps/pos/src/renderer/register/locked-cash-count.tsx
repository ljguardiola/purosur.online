import type { CashBalance, CloseLockedCashSessionOutcome } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, TextField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, ShoppingBasket, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { countedCashFrom, differenceNotice, INVALID_COUNTED_CASH_MESSAGE } from "./cash-amounts";
import { CashCountStrip } from "./cash-count-strip";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { useCashBalanceQuery } from "./register-queries";

const FAILED = "No se pudo cerrar la caja. Probá de nuevo.";

export type RefusedClose = Extract<
  CloseLockedCashSessionOutcome,
  { kind: "wrong_pin" | "rate_limited" | "locked" | "lacks_permission" | "not_locked" }
>;

export type LockedCashCountProps = {
  sessionId: string;
  opener: SignedInPerson;
  closerName: string;
  registerName: string | null;
  openedAt: string;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  close: (countedCash: number) => Promise<CloseLockedCashSessionOutcome>;
  onRefused: (refusal: RefusedClose) => void;
};

export function LockedCashCount({
  sessionId,
  opener,
  closerName,
  registerName,
  openedAt,
  loadCashBalance,
  close,
  onRefused,
}: LockedCashCountProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const field = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [fieldMessage, setFieldMessage] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [openSaleTotal, setOpenSaleTotal] = useState<number>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const expected = balance.status === "loaded" ? balance.value.expected : undefined;
  const typedCash = typed.trim() === "" ? undefined : countedCashFrom(typed);
  const counted = typedCash !== undefined && "cents" in typedCash ? typedCash.cents : undefined;
  const warning =
    expected === undefined || counted === undefined
      ? undefined
      : differenceNotice(counted - expected);

  function type(value: string) {
    setTyped(value);
    setFieldMessage(undefined);
    setFailed(false);
    setOpenSaleTotal(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setFailed(false);
    setOpenSaleTotal(undefined);
    const countedCash = countedCashFrom(typed);
    if ("message" in countedCash) {
      setFieldMessage(countedCash.message);
      return;
    }
    setFieldMessage(undefined);
    setSubmitting(true);
    const outcome = await close(countedCash.cents).catch(
      (): CloseLockedCashSessionOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "closed":
      case "no_open_session":
        break;
      case "invalid_counted_cash":
        setFieldMessage(INVALID_COUNTED_CASH_MESSAGE);
        break;
      case "open_sale":
        setOpenSaleTotal(outcome.total);
        break;
      case "unavailable":
        setFailed(true);
        break;
      default:
        onRefused(outcome);
    }
  }

  return (
    <form className="flex h-screen w-screen bg-surface" noValidate onSubmit={submit}>
      <main className="flex flex-1 flex-col gap-4 p-8">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1 className="text-display text-text-accent">Cerrar caja</h1>
          <p className="text-body text-text-subtle">
            {`Cierra ${closerName}. La sesión es de ${opener.first_name}.`}
          </p>
        </div>
        {openSaleTotal === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={<ShoppingBasket />}
            title={`Hay una venta abierta de ${formatCents(openSaleTotal)}`}
            description={`${opener.first_name} tiene que retomar la caja para terminarla o cancelarla.`}
          />
        )}
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <p className="text-body text-text-subtle">
            Contá el efectivo que hay en la caja y cargá el total.
          </p>
          <div ref={field}>
            <TextField
              kind="counted-cash"
              prefix="$"
              label="Efectivo contado"
              inputMode="numeric"
              value={typed}
              onChange={type}
              disabled={submitting}
              errorMessage={fieldMessage}
            />
          </div>
          <CashCountStrip expected={expected} counted={counted} />
          {warning === undefined ? null : (
            <InlineNotice tone="warning" icon={<TriangleAlert />} title={warning} />
          )}
          {failed ? <InlineNotice tone="error" icon={<TriangleAlert />} title={FAILED} /> : null}
        </section>
      </main>
      <ExpectedCashPanel eyebrow="EFECTIVO ESPERADO" balance={balance}>
        <Button
          type="submit"
          size="large"
          fullWidth
          icon={<Lock />}
          dataStatus={balance.status}
          disabled={submitting}
        >
          Cerrar caja
        </Button>
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<ArrowLeft />}
          disabled={submitting}
          onPress={() => void navigate({ to: "/locked" })}
        >
          Volver
        </Button>
      </ExpectedCashPanel>
    </form>
  );
}
