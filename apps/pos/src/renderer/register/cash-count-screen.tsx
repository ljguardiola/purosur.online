import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button, InlineNotice, TextField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AuthorizationSection } from "../access/authorization-section";
import type { SignedInPerson } from "../access/signed-in-person";
import { useAuthorization } from "../access/use-authorization";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { countedCashFrom, differenceNotice, INVALID_COUNTED_CASH_MESSAGE } from "./cash-amounts";
import { CashCountStrip } from "./cash-count-strip";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { OpenSaleBlock } from "./open-sale-block";
import { useCashBalanceQuery } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = {
  title: "No tenés permiso para cerrar la caja.",
  icon: "permission",
};
const FAILED: Notice = { title: "No se pudo cerrar la caja. Probá de nuevo.", icon: "failure" };

export type CashCountScreenProps = {
  person: SignedInPerson;
  openedBy: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  closeCashSession: (
    countedCash: number,
    authorization?: Authorization,
  ) => Promise<CloseCashSessionOutcome>;
};

export function CashCountScreen({
  person,
  openedBy,
  registerName,
  openedAt,
  lock,
  loadCashBalance,
  loadAuthorizers,
  closeCashSession,
}: CashCountScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(loadCashBalance);
  const authorization = useAuthorization({
    person,
    permission: "close_anothers_register_session",
    loadAuthorizers,
    applies: openedBy.user_id !== person.user_id,
  });
  const field = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [fieldMessage, setFieldMessage] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
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
    setNotice(undefined);
    setOpenSaleTotal(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    setOpenSaleTotal(undefined);
    const countedCash = countedCashFrom(typed);
    if ("message" in countedCash) {
      setFieldMessage(countedCash.message);
      return;
    }
    if (!authorization.ready) {
      return;
    }
    setFieldMessage(undefined);
    setSubmitting(true);
    const outcome = await closeCashSession(countedCash.cents, authorization.value).catch(
      (): CloseCashSessionOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "closed":
        authorization.performed();
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
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          setNotice(outcome.kind === "lacks_permission" ? NOT_PERMITTED : FAILED);
        }
        break;
      case "unavailable":
      case "not_signed_in":
        setNotice(FAILED);
        break;
      case "no_open_session":
        break;
    }
  }

  return (
    <div className="flex h-screen w-screen bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="cash"
      />
      <form className="flex flex-1" noValidate onSubmit={submit}>
        <main className="flex flex-1 flex-col gap-4 p-8">
          <div className="flex flex-col gap-1.5">
            <SessionEyebrow registerName={registerName} openedAt={openedAt} />
            <h1 className="text-display text-text-accent">Cerrar caja</h1>
          </div>
          {openSaleTotal === undefined ? null : (
            <OpenSaleBlock
              total={openSaleTotal}
              onGoToSale={() => void navigate({ to: "/session" })}
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
            {authorization.required ? (
              <div className="flex flex-col gap-3">
                <p className="text-detail text-text-subtle">
                  {`La sesión es de ${openedBy.first_name}: cerrarla pide el PIN de alguien con permiso para cerrar la sesión de otra persona.`}
                </p>
                <AuthorizationSection
                  authorization={authorization}
                  action="cerrar la sesión de otra persona"
                  disabled={submitting}
                />
              </div>
            ) : null}
            {notice === undefined ? null : (
              <InlineNotice
                tone="error"
                icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
                title={notice.title}
              />
            )}
          </section>
        </main>
        <ExpectedCashPanel eyebrow="EFECTIVO ESPERADO" balance={balance}>
          <Button
            type="submit"
            size="large"
            fullWidth
            icon={<Lock />}
            dataStatus={balance.status}
            disabled={submitting || !authorization.ready}
          >
            Cerrar caja
          </Button>
          <Button
            variant="secondary"
            size="large"
            fullWidth
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={() => void navigate({ to: "/cash" })}
          >
            Volver
          </Button>
        </ExpectedCashPanel>
      </form>
    </div>
  );
}
