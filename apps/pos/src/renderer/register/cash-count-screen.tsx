import type { CashBalance, CashCountPreview, CloseCashSessionOutcome } from "@purosur/contracts";
import { Button, Card, InlineNotice, ScreenHeader, useRequestForm } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { OpenSessionRail } from "../shell/open-session-rail";
import { sessionEyebrow } from "../shell/session-eyebrow";
import type { SignedInPerson } from "../shell/signed-in-person";
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
import { useCashBalanceQuery, useCashCountPreviewQuery } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = {
  title: "No tenés permiso para cerrar la caja.",
  icon: "permission",
};
const FAILED: Notice = { title: "No se pudo cerrar la caja. Probá de nuevo.", icon: "failure" };

export type CashCountScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadCashCountPreview: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">;
  closeCashSession: (countedCash: number) => Promise<CloseCashSessionOutcome>;
};

export function CashCountScreen({
  sessionId,
  person,
  registerName,
  openedAt,
  lock,
  loadCashBalance,
  loadCashCountPreview,
  closeCashSession,
}: CashCountScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const field = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const [openSaleTotal, setOpenSaleTotal] = useState<number>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_COUNTED_CASH_FORM,
    request: { schema: countedCashRequestSchema, from: countedCashRequestFrom },
    fields: { counted_cash: "countedCash" },
    messages: { countedCash: countedCashMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await closeCashSession(request.counted_cash).catch(
        (): CloseCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "closed":
          break;
        case "invalid_counted_cash":
          showFieldError("countedCash", INVALID_COUNTED_CASH_MESSAGE);
          break;
        case "open_sale":
          setOpenSaleTotal(outcome.total);
          break;
        case "lacks_permission":
          setNotice(NOT_PERMITTED);
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
  const difference = useCashCountPreviewQuery(sessionId, counted, loadCashCountPreview);
  const warning = difference === undefined ? undefined : differenceNotice(difference);

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
    <div className="flex h-full w-full bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="cash"
      />
      <form className="flex flex-1" noValidate onSubmit={handleSubmit}>
        <main className="flex flex-1 flex-col gap-4 p-8">
          <ScreenHeader eyebrow={sessionEyebrow(registerName, openedAt)} title="Cerrar caja" />
          {openSaleTotal === undefined ? null : (
            <OpenSaleBlock
              total={openSaleTotal}
              onGoToSale={() => void navigate({ to: "/session" })}
            />
          )}
          <Card>
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
            <CashCountStrip expected={expected} counted={counted} difference={difference} />
            {warning === undefined ? null : (
              <InlineNotice tone="warning" icon={<TriangleAlert />} title={warning} />
            )}
            {notice === undefined ? null : (
              <InlineNotice
                tone="error"
                icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
                title={notice.title}
              />
            )}
          </Card>
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
            onPress={() => void navigate({ to: "/cash" })}
          >
            Volver
          </Button>
        </ExpectedCashPanel>
      </form>
    </div>
  );
}
