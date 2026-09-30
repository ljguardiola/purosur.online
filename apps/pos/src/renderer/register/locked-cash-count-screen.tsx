import type {
  Authorization,
  CashBalance,
  CloseLockedCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button, formatCents, InlineNotice, TextField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, ShoppingBasket, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AuthorizationSection } from "../access/authorization-section";
import type { SignedInPerson } from "../access/signed-in-person";
import { useAuthorization } from "../access/use-authorization";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { countedCashFrom, differenceNotice, INVALID_COUNTED_CASH_MESSAGE } from "./cash-amounts";
import { CashCountStrip } from "./cash-count-strip";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { useCashBalance } from "./use-cash-balance";

const FAILED = "No se pudo cerrar la caja. Probá de nuevo.";

export type LockedCashCountScreenProps = {
  opener: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  closeLockedCashSession: (
    countedCash: number,
    closer: Authorization,
  ) => Promise<CloseLockedCashSessionOutcome>;
};

export function LockedCashCountScreen({
  opener,
  registerName,
  openedAt,
  loadCashBalance,
  loadAuthorizers,
  closeLockedCashSession,
}: LockedCashCountScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalance(loadCashBalance);
  const closer = useAuthorization({
    person: undefined,
    permission: "close_anothers_register_session",
    loadAuthorizers,
  });
  const field = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [fieldMessage, setFieldMessage] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [openSaleTotal, setOpenSaleTotal] = useState<number>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const expected = balance.state.status === "loaded" ? balance.state.balance.expected : undefined;
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
    if (closer.value === undefined) {
      return;
    }
    setFieldMessage(undefined);
    setSubmitting(true);
    const outcome = await closeLockedCashSession(countedCash.cents, closer.value).catch(
      (): CloseLockedCashSessionOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "closed":
        closer.performed();
        break;
      case "invalid_counted_cash":
        setFieldMessage(INVALID_COUNTED_CASH_MESSAGE);
        break;
      case "open_sale":
        setOpenSaleTotal(outcome.total);
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "lacks_permission":
        closer.refuse(outcome);
        break;
      case "unavailable":
      case "not_locked":
        setFailed(true);
        break;
      case "no_open_session":
        break;
    }
  }

  return (
    <form className="flex h-screen w-screen bg-surface" noValidate onSubmit={submit}>
      <main className="flex flex-1 flex-col gap-4 p-8">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1 className="text-display text-text-accent">Cerrar caja</h1>
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
          <div className="flex flex-col gap-3">
            <p className="text-detail text-text-subtle">
              {`La sesión es de ${opener.first_name}: la cierra alguien con permiso para cerrar la sesión de otra persona.`}
            </p>
            <AuthorizationSection
              authorization={closer}
              picks="closer"
              action="cerrar la sesión de otra persona"
              disabled={submitting}
            />
          </div>
          {failed ? <InlineNotice tone="error" icon={<TriangleAlert />} title={FAILED} /> : null}
        </section>
      </main>
      <ExpectedCashPanel
        eyebrow="EFECTIVO ESPERADO"
        balance={balance.state}
        onRetry={balance.retry}
      >
        <Button
          type="submit"
          size="large"
          fullWidth
          icon={<Lock />}
          dataStatus={balance.state.status}
          disabled={submitting || !closer.ready}
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
