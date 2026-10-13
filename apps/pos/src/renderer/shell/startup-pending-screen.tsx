import type {
  Authorization,
  CashBalance,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SignInUser,
  StartupPending,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  EmptyState,
  Eyebrow,
  FloatingNotification,
  formatCents,
  formatClockTime,
  LoadFailure,
  LoadingPlaceholder,
  ScreenHeader,
  SidePanel,
  StatusIndicator,
} from "@purosur/ui";
import {
  ArrowRight,
  CheckCheck,
  CreditCard,
  Landmark,
  Printer,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { StartupPendingAnswer } from "../register/register-queries";
import {
  useCashBalanceQuery,
  useRefreshStartupPending,
  useStartupPendingQuery,
} from "../register/register-queries";
import { hasStartupPendingItems } from "../register/startup-pending-items";
import { ReprintReceiptModal } from "../sales/reprint-receipt-modal";
import type { SaleDetail } from "../sales/sale-history-text";
import { receiptCopyPresentation } from "../sales/sale-history-text";
import { OpenSessionRail } from "./open-session-rail";
import type { SignedInPerson } from "./signed-in-person";
import { StartupPendingRow } from "./startup-pending-row";

const CONSULTING = (
  <StatusIndicator tone="neutral" busy>
    Consultando
  </StatusIndicator>
);

type SaleToPrint = StartupPending["sales_to_print"][number];

export type StartupPendingScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  sessionOwner: SignedInPerson;
  openedAt: string;
  registerName: string | null;
  lock: () => void;
  loadStartupPending: () => Promise<StartupPendingAnswer>;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  saleHistoryDetail: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  reprintSaleReceipt: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onGoSelling: () => void;
  onSessionInvalid: () => void;
};

function saleText(completedAt: string, total: number): string {
  return `Venta de las ${formatClockTime(completedAt)} por ${formatCents(total)}.`;
}

function SaleToPrintRow({
  sale,
  opening,
  onPrint,
}: {
  sale: SaleToPrint;
  opening: boolean;
  onPrint: () => void;
}) {
  const original = sale.standing === "never_printed";
  return (
    <StartupPendingRow
      icon={<Printer />}
      badge="info"
      title={original ? "Venta sin ticket" : "Ticket sin confirmar"}
      detail={
        original
          ? `${saleText(sale.completed_at, sale.total)} Nunca se imprimió: sale como ticket original.`
          : `${saleText(sale.completed_at, sale.total)} Puede que el ticket haya salido: se reimprime como duplicado.`
      }
      trailing={
        <Button
          variant={original ? "primary" : "secondary"}
          size="large"
          icon={<Printer />}
          dataStatus={opening ? "loading" : "loaded"}
          onPress={onPrint}
        >
          {original ? "Imprimir el ticket" : "Reimprimir como duplicado"}
        </Button>
      }
    />
  );
}

function PendingItems({
  pending,
  openingSaleId,
  onPrint,
}: {
  pending: StartupPending;
  openingSaleId: string | undefined;
  onPrint: (saleId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {pending.sales_to_print.map((sale) => (
        <SaleToPrintRow
          key={sale.sale_id}
          sale={sale}
          opening={openingSaleId === sale.sale_id}
          onPrint={() => onPrint(sale.sale_id)}
        />
      ))}
      {pending.unknown_fiscal_documents.map((document) => (
        <StartupPendingRow
          key={document.id}
          icon={<Landmark />}
          badge="neutral"
          title={`Factura de las ${formatClockTime(document.completed_at)}`}
          detail="Se está consultando a ARCA si quedó autorizada."
          trailing={CONSULTING}
        />
      ))}
      {pending.pending_payments.map((payment) => (
        <StartupPendingRow
          key={payment.payment_id}
          icon={payment.method === "QR" ? <QrCode /> : <CreditCard />}
          badge="info"
          title={`Cobro con ${payment.method === "QR" ? "QR" : "Point"} sin confirmar`}
          detail={`${formatCents(payment.amount)} de la venta de las ${formatClockTime(payment.occurred_at)}. Se está consultando a Mercado Pago.`}
          trailing={CONSULTING}
        />
      ))}
    </ul>
  );
}

function PendingSection({
  data,
  openingSaleId,
  onPrint,
}: {
  data: CoreData<StartupPendingAnswer>;
  openingSaleId: string | undefined;
  onPrint: (saleId: string) => void;
}) {
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="list" items={3} />;
  }
  if (data.status === "failed") {
    return (
      <LoadFailure
        icon={<TriangleAlert />}
        title="No se pudo leer lo que quedó pendiente"
        description="Podés ir a vender igual."
        onRetry={data.retry}
      />
    );
  }
  const pending = data.value;
  if (pending === "not_permitted" || !hasStartupPendingItems(pending)) {
    return <EmptyState variant="blank" icon={<CheckCheck />} title="No queda nada pendiente" />;
  }
  return <PendingItems pending={pending} openingSaleId={openingSaleId} onPrint={onPrint} />;
}

export function StartupPendingScreen({
  sessionId,
  person,
  sessionOwner,
  openedAt,
  registerName,
  lock,
  loadStartupPending,
  loadCashBalance,
  saleHistoryDetail,
  reprintSaleReceipt,
  loadAuthorizers,
  onGoSelling,
  onSessionInvalid,
}: StartupPendingScreenProps) {
  const pending = useStartupPendingQuery(loadStartupPending);
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const refreshPending = useRefreshStartupPending();
  const [openingSaleId, setOpeningSaleId] = useState<string>();
  const [printing, setPrinting] = useState<SaleDetail>();
  const [sent, setSent] = useState<ReceiptCopyShown>();
  const [problem, setProblem] = useState<{ title: string; description: string }>();

  async function openPrint(saleId: string) {
    setOpeningSaleId(saleId);
    setProblem(undefined);
    const outcome = await saleHistoryDetail(saleId).catch((): "failed" => "failed");
    setOpeningSaleId(undefined);
    if (outcome === "failed" || outcome.kind === "unavailable" || outcome.kind === "not_found") {
      setProblem({ title: "No se pudo abrir la venta", description: "Probá de nuevo." });
    } else if (outcome.kind === "lacks_permission") {
      setProblem({
        title: "No tenés permiso para ver la venta",
        description: "Pedile a quien pueda que la imprima.",
      });
    } else if (outcome.kind === "not_signed_in") {
      onSessionInvalid();
    } else {
      setPrinting(outcome.detail);
    }
  }

  const since = `Desde las ${formatClockTime(openedAt)}`;
  const openingFloat =
    balance.status === "loaded"
      ? ` · fondo ${formatCents(balance.value.opening_float.amount)}`
      : "";

  return (
    <div className="flex h-full w-full bg-surface">
      <OpenSessionRail
        registerName={registerName}
        lock={lock}
        current="sale"
        abilities={person.abilities}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 bg-surface-soft p-6">
        <ScreenHeader
          eyebrow={
            registerName === null ? "Antes de empezar" : `${registerName} · Antes de empezar`
          }
          title="Hay cosas para resolver"
          description="La caja se cerró sin terminar algunas operaciones. Esto es lo que quedó."
        />
        <PendingSection
          data={pending}
          openingSaleId={openingSaleId}
          onPrint={(saleId) => void openPrint(saleId)}
        />
      </main>
      <SidePanel
        footer={
          <>
            <p className="text-detail text-text-subtle">
              Lo que quedó pendiente se puede resolver después.
            </p>
            <Button size="sale" fullWidth icon={<ArrowRight />} onPress={onGoSelling}>
              Ir a vender
            </Button>
          </>
        }
      >
        <Eyebrow text="Sesión abierta" />
        <p className="text-title text-text-accent">{sessionOwner.first_name}</p>
        <p className="text-detail text-text-subtle">{`${since}${openingFloat}`}</p>
      </SidePanel>
      {printing === undefined ? null : (
        <ReprintReceiptModal
          sale={printing}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprintSaleReceipt={reprintSaleReceipt}
          onReprinted={(copy) => {
            setPrinting(undefined);
            setSent(copy);
            void refreshPending();
          }}
          onSaleGone={() => {
            setPrinting(undefined);
            void refreshPending();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setPrinting(undefined)}
        />
      )}
      {sent === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="El ticket sale en cuanto la impresora esté lista"
          description={`${receiptCopyPresentation(sent).comesOutAs}.`}
          onDismiss={() => setSent(undefined)}
        />
      )}
      {problem === undefined ? null : (
        <FloatingNotification
          tone="error"
          icon={<TriangleAlert />}
          title={problem.title}
          description={problem.description}
          onDismiss={() => setProblem(undefined)}
        />
      )}
    </div>
  );
}
