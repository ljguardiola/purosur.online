import type {
  Authorization,
  CashBalance,
  ConvertPaidOrderIntoRefundOutcome,
  PrintOriginalReceiptOutcome,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SignInUser,
  StartupPending,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { TableLoadingState } from "@purosur/ui";
import {
  actionsColumn,
  Button,
  dataColumn,
  Eyebrow,
  FloatingNotification,
  formatCents,
  formatClockTime,
  ScreenHeader,
  SidePanel,
  StatusIndicator,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { ArrowRight, CheckCheck, Printer, TriangleAlert, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import { OpenSessionRail } from "../shell/open-session-rail";
import { ReprintReceiptModal } from "../shell/reprint-receipt-modal";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { RefundPaidOrderModal } from "./refund-paid-order-modal";
import type { StartupPendingAnswer } from "./register-queries";
import {
  useCashBalanceQuery,
  useRefreshStartupPending,
  useStartupPendingQuery,
} from "./register-queries";
import { hasStartupPendingItems } from "./startup-pending-items";

type SaleToPrint = StartupPending["sales_to_print"][number];
type PaidOrder = StartupPending["paid_orders_without_sale"][number];

const SELLING_BLOCKED_REASON = "Pasá el cobro a reembolso para empezar a vender.";
const CHECKING_REASON = "Esperá a que la caja termine de consultar los cobros pagados.";
const UNCHECKED_PAID_ORDERS =
  "Puede haber un cobro pagado para esta caja sin venta. La caja lo va a consultar cuando vuelva la conexión.";
const CONSULTING_PAID_ORDERS =
  "Puede haber un cobro pagado para esta caja sin venta. La caja lo está consultando.";

const FAILED_PROBLEM = { title: "No se pudo imprimir el ticket", description: "Probá de nuevo." };

const PRINT_PROBLEMS = {
  busy: {
    title: "Esa venta ya se está imprimiendo",
    description: "Esperá a que termine antes de volver a imprimirla.",
  },
  printer_not_configured: {
    title: "La impresora no está configurada",
    description: "Cargá su dirección en Impresora y después imprimí el ticket de nuevo.",
  },
  lacks_permission: {
    title: "No tenés permiso para imprimir",
    description: "Pedile a quien pueda que imprima el ticket.",
  },
} as const;

export type StartupPendingScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  sessionOwner: SignedInPerson;
  openedAt: string;
  registerName: string | null;
  lock: () => void;
  loadStartupPending: () => Promise<StartupPendingAnswer>;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  printOriginalReceipt: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  reprintSaleReceipt: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  convertPaidOrderIntoRefund: (
    paymentTransactionId: string,
  ) => Promise<ConvertPaidOrderIntoRefundOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  clockGuard?: ReactNode | undefined;
  onGoSelling: () => void;
  onNothingLeft: () => void;
  onSessionInvalid: () => void;
};

function saleText(completedAt: string, total: number): string {
  return `Venta de las ${formatClockTime(completedAt)} por ${formatCents(total)}.`;
}

type PendingItem = {
  id: string;
  title: string;
  detail: string;
  sale: SaleToPrint | undefined;
  paidOrder: PaidOrder | undefined;
  unchecked: "consulting" | "deferred" | undefined;
};

function pendingItemsOf(pending: StartupPendingAnswer): PendingItem[] {
  if (pending === "not_permitted") {
    return [];
  }
  const others = [
    ...pending.sales_to_print.map((sale) =>
      sale.standing === "never_printed"
        ? {
            id: sale.sale_id,
            title: "Venta sin ticket",
            detail: `${saleText(sale.completed_at, sale.total)} Nunca se imprimió: sale como ticket original.`,
            sale,
            paidOrder: undefined,
            unchecked: undefined,
          }
        : {
            id: sale.sale_id,
            title: "Ticket sin confirmar",
            detail: `${saleText(sale.completed_at, sale.total)} Puede que el ticket haya salido: se reimprime como duplicado.`,
            sale,
            paidOrder: undefined,
            unchecked: undefined,
          },
    ),
    ...pending.unknown_fiscal_documents.map((document) => ({
      id: document.id,
      title: `Factura de las ${formatClockTime(document.completed_at)}`,
      detail: "Se está consultando a ARCA si quedó autorizada.",
      sale: undefined,
      paidOrder: undefined,
      unchecked: undefined,
    })),
    ...pending.pending_payments.map((payment) => ({
      id: payment.payment_id,
      title: `Cobro con ${payment.method === "QR" ? "QR" : "Point"} sin confirmar`,
      detail: `${formatCents(payment.amount)} de la venta de las ${formatClockTime(payment.occurred_at)}. Se está consultando a Mercado Pago.`,
      sale: undefined,
      paidOrder: undefined,
      unchecked: undefined,
    })),
  ];
  const paidOrders = pending.paid_orders_without_sale.map((order) => ({
    id: order.payment_transaction_id,
    title: `Cobro con ${order.method === "QR" ? "QR" : "Point"} pagado sin venta`,
    detail: `${formatCents(order.amount)} cobrados a las ${formatClockTime(order.created_at)}. La venta no quedó en la caja.`,
    sale: undefined,
    paidOrder: order,
    unchecked: undefined,
  }));
  const unchecked: PendingItem[] =
    pending.paid_order_discovery === "checked"
      ? []
      : [
          {
            id: "paid-order-discovery",
            title: "Cobros pagados sin consultar",
            detail:
              pending.paid_order_discovery === "pending"
                ? CONSULTING_PAID_ORDERS
                : UNCHECKED_PAID_ORDERS,
            sale: undefined,
            paidOrder: undefined,
            unchecked: pending.paid_order_discovery === "pending" ? "consulting" : "deferred",
          },
        ];
  return [...paidOrders, ...others, ...unchecked];
}

function printLabel(sale: SaleToPrint): string {
  const time = formatClockTime(sale.completed_at);
  return sale.standing === "never_printed"
    ? `Imprimir el ticket de la venta de las ${time}`
    : `Reimprimir como duplicado la venta de las ${time}`;
}

function itemState(
  item: PendingItem,
  printingSaleIds: ReadonlySet<string>,
  sellingBlocked: boolean,
) {
  if (item.paidOrder !== undefined) {
    return sellingBlocked ? <StatusIndicator tone="error">Bloquea la venta</StatusIndicator> : null;
  }
  if (item.unchecked === "deferred") {
    return <StatusIndicator tone="warning">Sin consultar</StatusIndicator>;
  }
  if (item.sale === undefined) {
    return (
      <StatusIndicator tone="neutral" busy>
        Consultando
      </StatusIndicator>
    );
  }
  return printingSaleIds.has(item.sale.sale_id) ? (
    <StatusIndicator tone="info" busy>
      Imprimiendo
    </StatusIndicator>
  ) : null;
}

function loadingOf(data: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (data.status === "loading") {
    return "initial";
  }
  return data.refreshing ? "updating" : false;
}

function PendingTable({
  data,
  printingSaleIds,
  onPrint,
  onRefund,
}: {
  data: CoreData<StartupPendingAnswer>;
  printingSaleIds: ReadonlySet<string>;
  onPrint: (sale: SaleToPrint) => void;
  onRefund: (order: PaidOrder) => void;
}) {
  const columns = [
    dataColumn({
      id: "item",
      header: "Pendiente",
      render: (item: PendingItem) => (
        <TableCellText description={item.detail}>{item.title}</TableCellText>
      ),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (item: PendingItem) =>
        itemState(
          item,
          printingSaleIds,
          data.status === "loaded" && data.value !== "not_permitted" && data.value.selling_blocked,
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acción",
      actions: [
        (item: PendingItem) => {
          const { sale } = item;
          return sale === undefined
            ? undefined
            : { icon: <Printer />, "aria-label": printLabel(sale), onPress: () => onPrint(sale) };
        },
        ({ paidOrder }: PendingItem) =>
          paidOrder === undefined
            ? undefined
            : {
                icon: <Undo2 />,
                "aria-label": `Pasar a reembolso el cobro de las ${formatClockTime(paidOrder.created_at)}`,
                onPress: () => onRefund(paidOrder),
              },
      ],
    }),
  ] as const;
  const table = useTableModel({
    items: data.status === "loaded" ? pendingItemsOf(data.value) : [],
    id: (item) => item.id,
    columns,
  });
  return (
    <Table
      aria-label="Pendientes"
      table={table}
      {...(data.status === "failed"
        ? {
            failure: {
              icon: <TriangleAlert />,
              title: "No se pudo leer lo que quedó pendiente",
              description: "Podés ir a vender igual.",
              onRetry: data.retry,
            },
          }
        : { loading: loadingOf(data) })}
      empty={{ variant: "blank", icon: <CheckCheck />, title: "No queda nada pendiente" }}
    />
  );
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
  printOriginalReceipt,
  reprintSaleReceipt,
  convertPaidOrderIntoRefund,
  loadAuthorizers,
  clockGuard,
  onGoSelling,
  onNothingLeft,
  onSessionInvalid,
}: StartupPendingScreenProps) {
  const pending = useStartupPendingQuery(loadStartupPending);
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const refreshPending = useRefreshStartupPending();
  const [printingSaleIds, setPrintingSaleIds] = useState<ReadonlySet<string>>(new Set());
  const [duplicateOf, setDuplicateOf] = useState<SaleToPrint>();
  const [refundOf, setRefundOf] = useState<PaidOrder>();
  const [refunded, setRefunded] = useState(false);
  const [sent, setSent] = useState<ReceiptCopyShown>();
  const [problem, setProblem] = useState<{ title: string; description: string }>();

  async function printOriginal(saleId: string) {
    if (printingSaleIds.has(saleId)) {
      return;
    }
    setPrintingSaleIds((printing) => new Set(printing).add(saleId));
    setProblem(undefined);
    const outcome = await printOriginalReceipt(saleId).catch((): "failed" => "failed");
    setPrintingSaleIds((printing) => {
      const still = new Set(printing);
      still.delete(saleId);
      return still;
    });
    if (outcome === "failed") {
      setProblem(FAILED_PROBLEM);
      return;
    }
    switch (outcome.kind) {
      case "started":
        setSent(outcome.copy);
        void refreshPending();
        break;
      case "already_attempted":
      case "not_found":
      case "sale_voided":
        void refreshPending();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "unavailable":
        setProblem(FAILED_PROBLEM);
        break;
      default:
        setProblem(PRINT_PROBLEMS[outcome.kind]);
    }
  }

  function print(sale: SaleToPrint) {
    if (sale.standing === "never_printed") {
      void printOriginal(sale.sale_id);
    } else {
      setDuplicateOf(sale);
    }
  }

  const settled =
    pending.status === "loaded" &&
    pending.value !== "not_permitted" &&
    pending.value.may_go_selling &&
    !hasStartupPendingItems(pending.value) &&
    !refunded &&
    sent === undefined;

  useEffect(() => {
    if (settled) {
      onNothingLeft();
    }
  }, [settled, onNothingLeft]);

  const keptFromSelling =
    pending.status === "loaded" &&
    pending.value !== "not_permitted" &&
    !pending.value.may_go_selling
      ? pending.value
      : undefined;
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
        {clockGuard}
        <PendingTable
          data={pending}
          printingSaleIds={printingSaleIds}
          onPrint={print}
          onRefund={setRefundOf}
        />
      </main>
      <SidePanel
        footer={
          keptFromSelling ? (
            <Button
              size="sale"
              fullWidth
              icon={<ArrowRight />}
              disabledReason={
                keptFromSelling.selling_blocked ? SELLING_BLOCKED_REASON : CHECKING_REASON
              }
            >
              Ir a vender
            </Button>
          ) : (
            <>
              <p className="text-detail text-text-subtle">
                Lo que quedó pendiente se puede resolver después.
              </p>
              <Button size="sale" fullWidth icon={<ArrowRight />} onPress={onGoSelling}>
                Ir a vender
              </Button>
            </>
          )
        }
      >
        <Eyebrow text="Sesión abierta" />
        <p className="text-title text-text-accent">{sessionOwner.first_name}</p>
        <p className="text-detail text-text-subtle">{`${since}${openingFloat}`}</p>
      </SidePanel>
      {duplicateOf === undefined ? null : (
        <ReprintReceiptModal
          sale={{
            sale_id: duplicateOf.sale_id,
            occurred_at: duplicateOf.completed_at,
            next_copy: { kind: "duplicate" },
          }}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprintSaleReceipt={reprintSaleReceipt}
          onReprinted={(copy) => {
            setDuplicateOf(undefined);
            setSent(copy);
            void refreshPending();
          }}
          onSaleGone={() => {
            setDuplicateOf(undefined);
            void refreshPending();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setDuplicateOf(undefined)}
        />
      )}
      {refundOf === undefined ? null : (
        <RefundPaidOrderModal
          order={refundOf}
          convertPaidOrderIntoRefund={convertPaidOrderIntoRefund}
          onConverted={() => {
            setRefundOf(undefined);
            setRefunded(true);
            void refreshPending();
          }}
          onGone={() => {
            setRefundOf(undefined);
            void refreshPending();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setRefundOf(undefined)}
        />
      )}
      {refunded ? (
        <FloatingNotification
          tone="success"
          icon={<Undo2 />}
          title="El cobro quedó como reembolso"
          description="Se confirma después en el backoffice."
          onDismiss={() => setRefunded(false)}
        />
      ) : null}
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
