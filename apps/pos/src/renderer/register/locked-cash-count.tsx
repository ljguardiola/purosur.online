import type {
  CancelLockedSaleOutcome,
  CashBalance,
  CashCountPreview,
  CloseLockedCashSessionOutcome,
  ListedCashMovement,
  SessionOpenSale,
} from "@purosur/contracts";
import { InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PaidSaleCancelledModal } from "../shell/paid-sale-cancelled-modal";
import type { Refund } from "../shell/refund-lines";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CancelLockedPaidSalePanel } from "./cancel-locked-paid-sale-panel";
import { CancelLockedSalePanel } from "./cancel-locked-sale-panel";
import { CashMovementsTable } from "./cash-movements-table";
import type { RefusedClose } from "./close-cash-session-panel";
import { CloseCashSessionPanel } from "./close-cash-session-panel";
import { lockedCountedCashRequestSchema } from "./counted-cash-form";
import { LockedOpenSaleBanner } from "./locked-open-sale-banner";
import {
  useCashBalanceQuery,
  useCashMovementsQuery,
  useReadSessionOpenSale,
  useSessionOpenSaleQuery,
  useSetSessionOpenSale,
} from "./register-queries";

const EMPTY_FAILED = "No se pudo vaciar la venta. Probá de nuevo.";
const CANCEL_FAILED = "No se pudo cancelar la venta. Probá de nuevo.";
const EMPTY_REFUSAL_MESSAGES: Record<NonNullable<SessionOpenSale["cancel_refusal"]>, string> = {
  mercado_pago_charge_in_progress:
    "Hay un cobro con Mercado Pago en curso. Esperá a que termine para vaciar la venta.",
};

export type LockedCashCountProps = {
  sessionId: string;
  opener: SignedInPerson;
  closerName: string;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadCashCountPreview: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">;
  loadOpenSale: () => Promise<SessionOpenSale | null | "unavailable">;
  loadCashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  close: (countedCash: number) => Promise<CloseLockedCashSessionOutcome>;
  cancelSale: (saleId: string) => Promise<CancelLockedSaleOutcome>;
  onRefused: (refusal: RefusedClose) => void;
};

export function LockedCashCount({
  sessionId,
  opener,
  closerName,
  loadCashBalance,
  loadCashCountPreview,
  loadOpenSale,
  loadCashMovements,
  close,
  cancelSale,
  onRefused,
}: LockedCashCountProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const movements = useCashMovementsQuery(sessionId, loadCashMovements);
  const openSaleData = useSessionOpenSaleQuery(sessionId, loadOpenSale);
  const setOpenSale = useSetSessionOpenSale(sessionId);
  const readOpenSale = useReadSessionOpenSale(sessionId, loadOpenSale);
  const [failure, setFailure] = useState<string>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const [cancelledRefunds, setCancelledRefunds] = useState<Refund[]>();
  const [countedCash, setCountedCash] = useState("");

  const openSale = openSaleData.status === "loaded" ? openSaleData.value : null;

  async function forgetOpenSale() {
    setConfirmingCancel(false);
    await setOpenSale(null);
  }

  async function showCancelledRefunds(refunds: Refund[]) {
    setCancelledRefunds(refunds);
    await forgetOpenSale();
  }

  async function askToCancelOpenSale() {
    setFailure(undefined);
    const paid = openSale?.has_approved_payment === true;
    const asked = openSale?.cancel_refusal === null ? openSale : await readOpenSale();
    if (asked === "unavailable") {
      setFailure(paid ? CANCEL_FAILED : EMPTY_FAILED);
    } else if (asked !== null) {
      setConfirmingCancel(true);
    }
  }

  async function emptyCart() {
    if (openSale === null) {
      return;
    }
    setEmptying(true);
    const outcome = await cancelSale(openSale.id).catch(
      (): CancelLockedSaleOutcome => ({ kind: "unavailable" }),
    );
    setEmptying(false);
    setConfirmingCancel(false);
    switch (outcome.kind) {
      case "cancelled":
      case "no_open_sale":
        await setOpenSale(null);
        break;
      case "not_permitted":
      case "no_open_session":
        break;
      case "mercado_pago_charge_in_progress":
        setFailure(EMPTY_REFUSAL_MESSAGES[outcome.kind]);
        break;
      case "unavailable":
      case "restoration_in_progress":
        setFailure(EMPTY_FAILED);
        break;
      default:
        onRefused(outcome);
    }
  }

  const chargeInProgress = openSale?.cancel_refusal === "mercado_pago_charge_in_progress";
  const sidePanel =
    confirmingCancel && openSale !== null ? (
      openSale.has_approved_payment ? (
        <CancelLockedPaidSalePanel
          total={openSale.total}
          paid={openSale.paid}
          refunds={openSale.refunds_on_cancel}
          chargeInProgress={chargeInProgress}
          cancelSale={() => cancelSale(openSale.id)}
          onCancelled={(refunds) => void showCancelledRefunds(refunds)}
          onSaleGone={() => void forgetOpenSale()}
          onRefused={onRefused}
          onClose={() => setConfirmingCancel(false)}
        />
      ) : (
        <CancelLockedSalePanel
          lineCount={openSale.line_count}
          total={openSale.total}
          busy={emptying}
          {...(chargeInProgress
            ? { refusal: EMPTY_REFUSAL_MESSAGES.mercado_pago_charge_in_progress }
            : {})}
          onClose={() => setConfirmingCancel(false)}
          onEmpty={() => void emptyCart()}
        />
      )
    ) : (
      <CloseCashSessionPanel
        sessionId={sessionId}
        countedCashSchema={lockedCountedCashRequestSchema}
        countedCashDraft={{ typed: countedCash, onType: setCountedCash }}
        balance={balance}
        openSale={openSaleData.status !== "loaded" || openSaleData.value !== null}
        loadCashCountPreview={loadCashCountPreview}
        closeCashSession={close}
        onClose={() => void navigate({ to: "/locked" })}
        onClosed={() => {}}
        onRefused={onRefused}
      />
    );

  return (
    <RegisterFrame
      background="surface"
      rail={null}
      crumb={`Cierra ${closerName} · sesión de ${opener.first_name}`}
      aside={sidePanel}
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <h1 className="sr-only">Movimientos de efectivo</h1>
        {openSaleData.status === "loading" ? <LoadingPlaceholder variant="card" lines={1} /> : null}
        {openSaleData.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo leer la venta abierta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={openSaleData.retry}
          />
        ) : null}
        {openSale === null || confirmingCancel ? null : (
          <LockedOpenSaleBanner
            total={openSale.total}
            hasApprovedPayment={openSale.has_approved_payment}
            onCancel={() => void askToCancelOpenSale()}
          />
        )}
        {failure === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={failure} />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CashMovementsTable state={movements} legend={[]} locked />
        </div>
      </main>
      {cancelledRefunds === undefined ? null : (
        <PaidSaleCancelledModal
          refunds={cancelledRefunds}
          onClose={() => setCancelledRefunds(undefined)}
        />
      )}
    </RegisterFrame>
  );
}
