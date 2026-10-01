import type { CashBalance, CloseLockedCashSessionOutcome } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, useRequestForm } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, ShoppingBasket, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { differenceNotice } from "./cash-amounts";
import { CashCountStrip } from "./cash-count-strip";
import {
  countedCashMessage,
  countedCashOf,
  countedCashRequestFrom,
  countedCashRequestSchema,
  EMPTY_COUNTED_CASH_FORM,
  INVALID_COUNTED_CASH_MESSAGE,
} from "./counted-cash-form";
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
  const [failed, setFailed] = useState(false);
  const [openSaleTotal, setOpenSaleTotal] = useState<number>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_COUNTED_CASH_FORM,
    request: { schema: countedCashRequestSchema, from: countedCashRequestFrom },
    fields: { counted_cash: "countedCash" },
    messages: { countedCash: countedCashMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await close(request.counted_cash).catch(
        (): CloseLockedCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "closed":
        case "no_open_session":
          break;
        case "invalid_counted_cash":
          showFieldError("countedCash", INVALID_COUNTED_CASH_MESSAGE);
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
    },
  });

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const expected = balance.status === "loaded" ? balance.value.expected : undefined;
  const counted = countedCashOf(values);
  const warning =
    expected === undefined || counted === undefined
      ? undefined
      : differenceNotice(counted - expected);

  function clearOutcome() {
    setFailed(false);
    setOpenSaleTotal(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    clearOutcome();
    void submit();
  }

  return (
    <form className="flex h-screen w-screen bg-surface" noValidate onSubmit={handleSubmit}>
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
            <form.AppField name="countedCash" listeners={{ onChange: clearOutcome }}>
              {(countedCash) => (
                <countedCash.TextField
                  kind="counted-cash"
                  prefix="$"
                  label="Efectivo contado"
                  inputMode="numeric"
                  disabled={submitting}
                />
              )}
            </form.AppField>
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
