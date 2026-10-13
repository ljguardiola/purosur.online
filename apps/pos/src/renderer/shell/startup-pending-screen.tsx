import type {
  Authorization,
  CashBalance,
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
import { ArrowRight, CheckCheck, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { CoreData } from "../platform/use-core-query";
import type { StartupPendingAnswer } from "../register/register-queries";
import {
  useCashBalanceQuery,
  useRefreshStartupPending,
  useStartupPendingQuery,
} from "../register/register-queries";
import { ReprintReceiptModal } from "../sales/reprint-receipt-modal";
import { receiptCopyPresentation } from "../sales/sale-history-text";
import { OpenSessionRail } from "./open-session-rail";
import type { SignedInPerson } from "./signed-in-person";

type SaleToPrint = StartupPending["sales_to_print"][number];

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
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onGoSelling: () => void;
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
};

function pendingItemsOf(pending: StartupPendingAnswer): PendingItem[] {
  if (pending === "not_permitted") {
    return [];
  }
  return [
    ...pending.sales_to_print.map((sale) =>
      sale.standing === "never_printed"
        ? {
            id: sale.sale_id,
            title: "Venta sin ticket",
            detail: `${saleText(sale.completed_at, sale.total)} Nunca se imprimió: sale como ticket original.`,
            sale,
          }
        : {
            id: sale.sale_id,
            title: "Ticket sin confirmar",
            detail: `${saleText(sale.completed_at, sale.total)} Puede que el ticket haya salido: se reimprime como duplicado.`,
            sale,
          },
    ),
    ...pending.unknown_fiscal_documents.map((document) => ({
      id: document.id,
      title: `Factura de las ${formatClockTime(document.completed_at)}`,
      detail: "Se está consultando a ARCA si quedó autorizada.",
      sale: undefined,
    })),
    ...pending.pending_payments.map((payment) => ({
      id: payment.payment_id,
      title: `Cobro con ${payment.method === "QR" ? "QR" : "Point"} sin confirmar`,
      detail: `${formatCents(payment.amount)} de la venta de las ${formatClockTime(payment.occurred_at)}. Se está consultando a Mercado Pago.`,
      sale: undefined,
    })),
  ];
}

function printLabel(sale: SaleToPrint): string {
  const time = formatClockTime(sale.completed_at);
  return sale.standing === "never_printed"
    ? `Imprimir el ticket de la venta de las ${time}`
    : `Reimprimir como duplicado la venta de las ${time}`;
}

function itemState(item: PendingItem, printingSaleIds: ReadonlySet<string>) {
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
}: {
  data: CoreData<StartupPendingAnswer>;
  printingSaleIds: ReadonlySet<string>;
  onPrint: (sale: SaleToPrint) => void;
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
      render: (item: PendingItem) => itemState(item, printingSaleIds),
    }),
    actionsColumn({
      id: "print",
      header: "Imprimir",
      actions: [
        (item: PendingItem) => {
          const { sale } = item;
          return sale === undefined
            ? undefined
            : { icon: <Printer />, "aria-label": printLabel(sale), onPress: () => onPrint(sale) };
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
  loadAuthorizers,
  onGoSelling,
  onSessionInvalid,
}: StartupPendingScreenProps) {
  const pending = useStartupPendingQuery(loadStartupPending);
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const refreshPending = useRefreshStartupPending();
  const [printingSaleIds, setPrintingSaleIds] = useState<ReadonlySet<string>>(new Set());
  const [duplicateOf, setDuplicateOf] = useState<SaleToPrint>();
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
        <PendingTable data={pending} printingSaleIds={printingSaleIds} onPrint={print} />
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
