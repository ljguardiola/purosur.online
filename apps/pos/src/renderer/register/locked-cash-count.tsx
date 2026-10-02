import type {
  CancelLockedSaleOutcome,
  CashBalance,
  CloseLockedCashSessionOutcome,
  SessionOpenSale,
} from "@purosur/contracts";
import {
  Button,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  useRequestForm,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, ShoppingBasket, TriangleAlert, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { CancelLockedSaleModal } from "./cancel-locked-sale-modal";
import { differenceNotice } from "./cash-amounts";
import { CashCountStrip } from "./cash-count-strip";
import {
  countedCashMessage,
  countedCashOf,
  countedCashRequestFrom,
  EMPTY_COUNTED_CASH_FORM,
  INVALID_COUNTED_CASH_MESSAGE,
  lockedCountedCashRequestSchema,
} from "./counted-cash-form";
import { ExpectedCashPanel } from "./expected-cash-panel";
import {
  useCashBalanceQuery,
  useSessionOpenSaleQuery,
  useSetSessionOpenSale,
} from "./register-queries";

const CLOSE_FAILED = "No se pudo cerrar la caja. Probá de nuevo.";
const CANCEL_FAILED = "No se pudo cancelar la venta. Probá de nuevo.";

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
  loadOpenSale: () => Promise<SessionOpenSale | null | "unavailable">;
  checkCountedCash: (countedCash: number) => Promise<"counted_cash"[]>;
  close: (countedCash: number) => Promise<CloseLockedCashSessionOutcome>;
  cancelSale: () => Promise<CancelLockedSaleOutcome>;
  onRefused: (refusal: RefusedClose) => void;
};

export function LockedCashCount({
  sessionId,
  opener,
  closerName,
  registerName,
  openedAt,
  loadCashBalance,
  loadOpenSale,
  checkCountedCash,
  close,
  cancelSale,
  onRefused,
}: LockedCashCountProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const openSaleData = useSessionOpenSaleQuery(sessionId, loadOpenSale);
  const setOpenSale = useSetSessionOpenSale(sessionId);
  const field = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { form, submit, submitting, values, refused } = useRequestForm({
    defaultValues: EMPTY_COUNTED_CASH_FORM,
    request: { schema: lockedCountedCashRequestSchema, from: countedCashRequestFrom },
    fields: { counted_cash: "countedCash" },
    messages: { countedCash: countedCashMessage },
    check: ({ counted_cash }) => checkCountedCash(counted_cash),
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
          await setOpenSale({ total: outcome.total, cancellable: outcome.cancellable });
          break;
        case "unavailable":
          setFailure(CLOSE_FAILED);
          break;
        default:
          onRefused(outcome);
      }
    },
  });
  const busy = submitting || cancelling;

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const openSale = openSaleData.status === "loaded" ? openSaleData.value : null;
  const expected = balance.status === "loaded" ? balance.value.expected : undefined;
  const counted = refused.includes("countedCash")
    ? undefined
    : countedCashOf(lockedCountedCashRequestSchema, values);
  const warning =
    expected === undefined || counted === undefined
      ? undefined
      : differenceNotice(counted - expected);

  function clearOutcome() {
    setFailure(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    clearOutcome();
    void submit();
  }

  async function cancelOpenSale() {
    clearOutcome();
    setCancelling(true);
    const outcome = await cancelSale().catch(
      (): CancelLockedSaleOutcome => ({ kind: "unavailable" }),
    );
    setCancelling(false);
    setConfirmingCancel(false);
    switch (outcome.kind) {
      case "cancelled":
      case "no_open_sale":
        await setOpenSale(null);
        break;
      case "has_approved_payment":
        await setOpenSale(openSale && { ...openSale, cancellable: false });
        break;
      case "no_open_session":
        break;
      case "unavailable":
        setFailure(CANCEL_FAILED);
        break;
      default:
        onRefused(outcome);
    }
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
        {openSaleData.status === "loading" ? <LoadingPlaceholder variant="card" lines={1} /> : null}
        {openSaleData.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo leer la venta abierta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={openSaleData.retry}
          />
        ) : null}
        {openSale === null ? null : (
          <div className="flex flex-col items-start gap-3">
            <InlineNotice
              tone="error"
              icon={<ShoppingBasket />}
              title={`Hay una venta abierta de ${formatCents(openSale.total)}`}
              description={
                openSale.cancellable
                  ? "Cancelala para cerrar la caja."
                  : `${opener.first_name} tiene que retomar la caja para terminarla o cancelarla.`
              }
            />
            {openSale.cancellable ? (
              <Button
                variant="secondary"
                icon={<X />}
                disabled={busy}
                onPress={() => setConfirmingCancel(true)}
              >
                Cancelar la venta
              </Button>
            ) : null}
          </div>
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
                  disabled={busy}
                />
              )}
            </form.AppField>
          </div>
          <CashCountStrip expected={expected} counted={counted} />
          {warning === undefined ? null : (
            <InlineNotice tone="warning" icon={<TriangleAlert />} title={warning} />
          )}
          {failure === undefined ? null : (
            <InlineNotice tone="error" icon={<TriangleAlert />} title={failure} />
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
          disabled={busy}
        >
          Cerrar caja
        </Button>
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<ArrowLeft />}
          disabled={busy}
          onPress={() => void navigate({ to: "/locked" })}
        >
          Volver
        </Button>
      </ExpectedCashPanel>
      {openSale === null ? null : (
        <CancelLockedSaleModal
          open={confirmingCancel}
          total={openSale.total}
          busy={busy}
          onClose={() => setConfirmingCancel(false)}
          onCancelSale={() => void cancelOpenSale()}
        />
      )}
    </form>
  );
}
