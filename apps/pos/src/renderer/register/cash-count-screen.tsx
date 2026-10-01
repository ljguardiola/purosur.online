import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button, InlineNotice, useRequestForm } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AuthorizationSection } from "../access/authorization-section";
import type { SignedInPerson } from "../access/signed-in-person";
import { useAuthorization } from "../access/use-authorization";
import { OpenSessionRail } from "../shell/open-session-rail";
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
import { OpenSaleBlock } from "./open-sale-block";
import { useCashBalanceQuery } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = {
  title: "No tenés permiso para cerrar la caja.",
  icon: "permission",
};
const FAILED: Notice = { title: "No se pudo cerrar la caja. Probá de nuevo.", icon: "failure" };

export type CashCountScreenProps = {
  sessionId: string;
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
  sessionId,
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
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const authorization = useAuthorization({
    person,
    permission: "close_anothers_register_session",
    loadAuthorizers,
    applies: openedBy.user_id !== person.user_id,
  });
  const field = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const [openSaleTotal, setOpenSaleTotal] = useState<number>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_COUNTED_CASH_FORM,
    request: { schema: countedCashRequestSchema, from: countedCashRequestFrom },
    fields: { counted_cash: "countedCash" },
    messages: { countedCash: countedCashMessage },
    onSubmit: async (request, { showFieldError }) => {
      if (!authorization.ready) {
        return;
      }
      const outcome = await closeCashSession(request.counted_cash, authorization.value).catch(
        (): CloseCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "closed":
          authorization.performed();
          break;
        case "invalid_counted_cash":
          showFieldError("countedCash", INVALID_COUNTED_CASH_MESSAGE);
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
    },
  });

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const expected = balance.status === "loaded" ? balance.value.expected : undefined;
  const counted = countedCashOf(countedCashRequestSchema, values);
  const warning =
    expected === undefined || counted === undefined
      ? undefined
      : differenceNotice(counted - expected);

  function clearOutcome() {
    setNotice(undefined);
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
    <div className="flex h-screen w-screen bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="cash"
      />
      <form className="flex flex-1" noValidate onSubmit={handleSubmit}>
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
