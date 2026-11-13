import type {
  Authorization,
  PrintCreditNoteOutcome,
  PrintDeferredSaleInvoiceOutcome,
  PrintOriginalReceiptOutcome,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SaleCreditNote,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, PrintedDocument } from "@purosur/domain";
import type { EmptyStateProps, NoticeTone } from "@purosur/ui";
import {
  Keycap,
  parseDocumentNumber,
  SearchField,
  SegmentedControl,
  ToastStack,
} from "@purosur/ui";
import { CircleX, Lock, Printer, Receipt, Search, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SalesHistoryQuery } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import type { CoreData } from "../platform/use-core-query";
import { RegisterFrame } from "../shell/register-frame";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { voidedSaleNotice } from "./credit-note-text";
import { deferredInvoiceNotYetDescription, deferredSaleRefusal } from "./deferred-sale-text";
import { originalPrintNotice } from "./original-print-text";
import { ReprintSalePanel } from "./reprint-sale-panel";
import type { SaleAction } from "./sale-history-actions";
import { saleActionsOf } from "./sale-history-actions";
import type { SaleButton } from "./sale-history-detail-panel";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";
import { SalesHistoryRail } from "./sales-history-rail";
import { SalesHistoryTable } from "./sales-history-table";
import type { ShownSalesHistory } from "./sales-queries";
import {
  useRefreshSalesHistory,
  useSaleHistoryDetailQuery,
  useSalesHistoryQuery,
} from "./sales-queries";
import { VoidSalePanel } from "./void-sale-panel";

export type SalesHistoryScreenProps = {
  person: SignedInPerson;
  sessionOpen: boolean;
  lock: () => void;
  salesHistory: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
  saleHistoryDetail: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  reprintSaleReceipt: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printOriginalReceipt: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  printCreditNote: (saleId: string, creditNoteId: string) => Promise<PrintCreditNoteOutcome>;
  reprintCreditNote: (
    saleId: string,
    creditNoteId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printDeferredSaleInvoice: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
  reprintDeferredSaleInvoice: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
};

type SessionFilter = "open" | "all";
type Notice = { tone: NoticeTone; title: string; description: string };
type OpenPanel =
  | { kind: "void" }
  | { kind: "reprint"; document: PrintedDocument; creditNoteId?: string };

const SESSION_OPTIONS = [
  { value: "open", label: "Esta sesión" },
  { value: "all", label: "Todas" },
] as const;

const REPRINT_STARTED_TITLES: Record<PrintedDocument, string> = {
  sale_receipt: "El ticket sale en cuanto la impresora esté lista",
  credit_note: "La reimpresión de la nota de crédito sale en cuanto la impresora esté lista",
  deferred_invoice: "La reimpresión de la factura sale en cuanto la impresora esté lista",
};

const KEY_ORDER = ["F5", "F6", "Enter"];

const NO_SALES_WITH_NUMBER = "No hay ventas con ese número";

const NO_FOUND: CoreData<ShownSalesHistory> = {
  status: "loaded",
  value: { kind: "found", rows: [], total: 0, page_size: 1 },
  refreshing: false,
};

function reprintNextCopy(
  open: Extract<OpenPanel, { kind: "reprint" }>,
  shown: SaleDetail,
): ReceiptCopyShown | null | undefined {
  switch (open.document) {
    case "credit_note":
      return shown.credit_notes.find((candidate) => candidate.credit_note_id === open.creditNoteId)
        ?.next_copy;
    case "deferred_invoice":
      return shown.deferred_invoice_next_copy;
    case "sale_receipt":
      return shown.next_copy;
  }
}

function panelOffered(open: OpenPanel, shown: SaleDetail | undefined): boolean {
  if (shown === undefined) {
    return false;
  }
  return open.kind === "void"
    ? shown.voidability.kind === "voidable"
    : reprintNextCopy(open, shown)?.kind === "duplicate";
}

function emptyStateOf(
  refusal: "lacks_permission" | "not_signed_in" | undefined,
  searching: boolean,
  session: SessionFilter,
): EmptyStateProps {
  if (refusal === "lacks_permission") {
    return {
      variant: "blank",
      icon: <Lock />,
      title: "No tenés permiso para ver el historial de ventas",
    };
  }
  if (refusal === "not_signed_in") {
    return {
      variant: "blank",
      icon: <TriangleAlert />,
      title: "La sesión terminó. Volvé a ingresar para ver las ventas",
    };
  }
  if (searching) {
    return { variant: "filtered", icon: <Receipt />, title: NO_SALES_WITH_NUMBER };
  }
  return session === "open"
    ? { variant: "filtered", icon: <Receipt />, title: "No hay ventas en la sesión abierta" }
    : { variant: "blank", icon: <Receipt />, title: "Todavía no hay ventas" };
}

export function SalesHistoryScreen({
  person,
  sessionOpen,
  lock,
  salesHistory,
  saleHistoryDetail,
  reprintSaleReceipt,
  printOriginalReceipt,
  voidSale,
  printCreditNote,
  reprintCreditNote,
  printDeferredSaleInvoice,
  reprintDeferredSaleInvoice,
  loadAuthorizers,
  onSessionInvalid,
}: SalesHistoryScreenProps) {
  const [session, setSession] = useState<SessionFilter>(sessionOpen ? "open" : "all");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<string>();
  const [wantsLast, setWantsLast] = useState(false);
  const [panel, setPanel] = useState<OpenPanel>();
  const [voided, setVoided] = useState<{ creditNote: SaleCreditNote | null }>();
  const [notice, setNotice] = useState<Notice>();
  const [sent, setSent] = useState<{ copy: ReceiptCopyShown; document: PrintedDocument }>();
  const [printing, setPrinting] = useState<ReadonlySet<string>>(new Set());
  const searchArea = useRef<HTMLDivElement | null>(null);
  const tableArea = useRef<HTMLDivElement | null>(null);

  const typed = search.trim() !== "";
  const parsed = typed ? parseDocumentNumber(search) : undefined;
  const invalidSearch = typed && parsed === undefined;
  const read = useSalesHistoryQuery({
    session,
    state: "all",
    page,
    document: parsed,
    read: salesHistory,
  });
  const history = invalidSearch ? NO_FOUND : read;
  const refreshHistory = useRefreshSalesHistory();

  const found =
    history.status === "loaded" && history.value.kind === "found" ? history.value : undefined;
  const rows = found === undefined ? [] : found.rows;
  const refusal =
    history.status === "loaded" &&
    (history.value.kind === "lacks_permission" || history.value.kind === "not_signed_in")
      ? history.value.kind
      : undefined;
  const pageCount = found === undefined ? 1 : Math.ceil(found.total / found.page_size);
  const selectedRow = wantsLast
    ? rows.at(-1)
    : (rows.find((row) => row.sale_id === selectedSaleId) ?? rows[0]);
  const selectedId = selectedRow?.sale_id;

  const detail = useSaleHistoryDetailQuery({ saleId: selectedId, read: saleHistoryDetail });
  const sale =
    detail.status === "loaded" && detail.value.kind === "found" ? detail.value.detail : undefined;
  const actions = sale === undefined ? undefined : saleActionsOf(sale);
  const shownPanel = panel !== undefined && panelOffered(panel, sale) ? panel : undefined;
  if (panel !== undefined && shownPanel === undefined) {
    setPanel(undefined);
  }

  useEffect(() => {
    if (selectedId !== undefined) {
      tableArea.current
        ?.querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  useEffect(() => {
    const update = () => setTyping(searchArea.current?.contains(document.activeElement) ?? false);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  function select(saleId: string | undefined) {
    setSelectedSaleId(saleId);
    setWantsLast(false);
    setPanel(undefined);
  }

  function changeSession(next: SessionFilter) {
    setSession(next);
    setPage(1);
    select(undefined);
  }

  function changeSearch(text: string) {
    setSearch(text);
    setPage(1);
    select(undefined);
  }

  function moveSelection(pressed: string) {
    const index = rows.findIndex((row) => row.sale_id === selectedId);
    if (pressed === "ArrowDown") {
      const next = rows[index + 1];
      if (next !== undefined) {
        select(next.sale_id);
      } else if (page < pageCount) {
        setPage(page + 1);
        select(undefined);
      }
      return;
    }
    const previous = rows[index - 1];
    if (previous !== undefined) {
      select(previous.sale_id);
    } else if (page > 1) {
      setPage(page - 1);
      select(undefined);
      setWantsLast(true);
    }
  }

  async function printOriginalOf(
    document: PrintedDocument,
    printingKey: string,
    ask: () => Promise<PrintOriginalReceiptOutcome | PrintCreditNoteOutcome>,
  ) {
    if (printing.has(printingKey)) {
      return;
    }
    setPrinting((all) => new Set(all).add(printingKey));
    const outcome = await ask().catch((): "failed" => "failed");
    setPrinting((all) => {
      const still = new Set(all);
      still.delete(printingKey);
      return still;
    });
    if (outcome === "failed") {
      setNotice(originalPrintNotice(document, "unavailable"));
      return;
    }
    switch (outcome.kind) {
      case "not_found":
      case "sale_voided":
        select(undefined);
        void refreshHistory();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      default:
        setNotice(originalPrintNotice(document, outcome.kind));
        void refreshHistory();
    }
  }

  async function printDeferredInvoice(saleId: string) {
    const printingKey = `deferred_invoice:${saleId}`;
    if (printing.has(printingKey)) {
      return;
    }
    setPrinting((all) => new Set(all).add(printingKey));
    const outcome = await printDeferredSaleInvoice(saleId).catch((): "failed" => "failed");
    setPrinting((all) => {
      const still = new Set(all);
      still.delete(printingKey);
      return still;
    });
    if (outcome === "failed") {
      setNotice(originalPrintNotice("deferred_invoice", "unavailable"));
      return;
    }
    switch (outcome.kind) {
      case "started":
        setNotice(originalPrintNotice("deferred_invoice", "started"));
        void refreshHistory();
        break;
      case "not_yet":
        setNotice({
          tone: "warning",
          title: "Todavía no se puede facturar",
          description: deferredInvoiceNotYetDescription(outcome.cause),
        });
        break;
      case "already_printed":
      case "voided":
      case "expired":
      case "out_of_date_order":
        setNotice(deferredSaleRefusal(outcome.kind));
        void refreshHistory();
        break;
      case "sale_voided":
        setNotice(deferredSaleRefusal("voided"));
        void refreshHistory();
        break;
      case "not_found":
        select(undefined);
        void refreshHistory();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "busy":
      case "printer_not_configured":
      case "lacks_permission":
      case "unavailable":
        setNotice(originalPrintNotice("deferred_invoice", outcome.kind));
        break;
    }
  }

  function perform(saleDetail: SaleDetail, action: SaleAction) {
    switch (action.kind) {
      case "print_original_receipt":
        void printOriginalOf("sale_receipt", `sale_receipt:${saleDetail.sale_id}`, () =>
          printOriginalReceipt(saleDetail.sale_id),
        );
        break;
      case "reprint_receipt":
        setPanel({ kind: "reprint", document: "sale_receipt" });
        break;
      case "print_credit_note":
        void printOriginalOf("credit_note", `credit_note:${action.creditNote.credit_note_id}`, () =>
          printCreditNote(saleDetail.sale_id, action.creditNote.credit_note_id),
        );
        break;
      case "reprint_credit_note":
        setPanel({
          kind: "reprint",
          document: "credit_note",
          creditNoteId: action.creditNote.credit_note_id,
        });
        break;
      case "reprint_deferred_invoice":
        setPanel({ kind: "reprint", document: "deferred_invoice" });
        break;
      case "print_deferred_invoice":
        void printDeferredInvoice(saleDetail.sale_id);
        break;
    }
  }

  const panelOpen = shownPanel !== undefined;
  const entries = actions === undefined ? [] : actions.entries;
  const keyedEntries = [...entries].sort(
    (left, right) => KEY_ORDER.indexOf(left.key ?? "F5") - KEY_ORDER.indexOf(right.key ?? "F5"),
  );
  const shownLegend = rows.length > 0;
  const legend = useKeys(
    [
      {
        key: "ArrowUpDown",
        run: moveSelection,
        enabled: rows.length > 0,
        ...(shownLegend ? { label: "Ventas" } : {}),
      },
      {
        key: "F2",
        run: () => searchArea.current?.querySelector("input")?.focus(),
        enabled: refusal === undefined,
        ...(shownLegend ? { label: "Buscar" } : {}),
      },
      {
        key: "F3",
        run: () => changeSession(session === "open" ? "all" : "open"),
        enabled: refusal === undefined,
      },
      ...keyedEntries.flatMap((entry) =>
        entry.key === undefined || sale === undefined
          ? []
          : [
              {
                key: entry.key,
                run: () => perform(sale, entry.action),
                ...(entry.legend === undefined ? {} : { label: entry.legend }),
              },
            ],
      ),
      {
        key: "Delete" as const,
        label: "Anular",
        run: () => setPanel({ kind: "void" }),
        enabled: actions?.canVoid === true && !typing,
      },
      {
        key: "R" as const,
        run: () => {
          if (history.status === "failed") {
            history.retry();
          } else if (detail.status === "failed") {
            detail.retry();
          }
        },
        enabled: history.status === "failed" || detail.status === "failed",
        ...(history.status === "failed" ? { label: "Reintentar" } : {}),
      },
    ],
    { active: !panelOpen },
  );

  const detailButtons: SaleButton[] =
    sale === undefined
      ? []
      : entries.map((entry) => ({
          ...(entry.key === undefined ? {} : { key: entry.key }),
          label: entry.label,
          primary: entry.primary,
          onPress: () => perform(sale, entry.action),
        }));

  const toasts = [
    ...(voided === undefined
      ? []
      : [
          {
            id: "voided",
            ...voidedSaleNotice(voided.creditNote),
            icon: <CircleX />,
            onDismiss: () => setVoided(undefined),
          },
        ]),
    ...(notice === undefined
      ? []
      : [
          {
            id: "notice",
            ...notice,
            icon: notice.tone === "success" ? <Printer /> : <TriangleAlert />,
            onDismiss: () => setNotice(undefined),
          },
        ]),
    ...(sent === undefined
      ? []
      : [
          {
            id: "sent",
            tone: "success" as const,
            icon: <Printer />,
            title: REPRINT_STARTED_TITLES[sent.document],
            description: `${receiptCopyPresentation(sent.copy).comesOutAs}.`,
            onDismiss: () => setSent(undefined),
          },
        ]),
  ];

  function reprintPanel(open: Extract<OpenPanel, { kind: "reprint" }>, shown: SaleDetail) {
    const creditNote = shown.credit_notes.find(
      (candidate) => candidate.credit_note_id === open.creditNoteId,
    );
    const nextCopy = reprintNextCopy(open, shown);
    if (nextCopy?.kind !== "duplicate") {
      return null;
    }
    const closeAfter = (copy: ReceiptCopyShown) => {
      setPanel(undefined);
      setSent({ copy, document: open.document });
      void refreshHistory();
    };
    const reprint =
      open.document === "credit_note" && creditNote !== undefined
        ? (saleId: string, reason: string, authorization: Authorization | undefined) =>
            reprintCreditNote(saleId, creditNote.credit_note_id, reason, authorization)
        : open.document === "deferred_invoice"
          ? reprintDeferredSaleInvoice
          : reprintSaleReceipt;
    return (
      <ReprintSalePanel
        document={open.document}
        sale={{
          ...shown,
          credit_note: creditNote?.standing ?? null,
          next_copy: nextCopy,
        }}
        withDate={session === "all"}
        authorizationRequired={shown.reprint_authorization_required}
        loadAuthorizers={loadAuthorizers}
        reprint={reprint}
        onReprinted={closeAfter}
        onSaleGone={() => {
          select(undefined);
          void refreshHistory();
        }}
        onSessionInvalid={onSessionInvalid}
        onClose={() => setPanel(undefined)}
      />
    );
  }

  const locked = refusal !== undefined || shownPanel?.kind === "void";

  return (
    <RegisterFrame
      background="surface"
      rail={<SalesHistoryRail person={person} sessionOpen={sessionOpen} lock={lock} />}
      aside={
        <SaleHistoryDetailPanel
          detail={selectedId === undefined ? undefined : detail}
          withDate={session === "all"}
          buttons={detailButtons}
          escape={refusal !== undefined}
        />
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-8 pt-4 pb-6">
        <div className="flex items-center gap-3">
          <div ref={searchArea} className="min-w-0 flex-1">
            <SearchField
              placeholder="Escribí el número del comprobante"
              icon={<Search />}
              value={search}
              onChange={changeSearch}
              invalid={invalidSearch}
              disabled={locked}
            />
          </div>
          <Keycap keyName="F3" />
          <SegmentedControl
            label="Sesión"
            size="large"
            options={SESSION_OPTIONS}
            value={session}
            onChange={changeSession}
            disabled={locked}
          />
        </div>
        <ToastStack toasts={toasts}>
          <div ref={tableArea} className="flex min-h-0 flex-1 flex-col">
            <SalesHistoryTable
              history={history}
              withDate={session === "all"}
              selectedSaleId={selectedId}
              inactive={shownPanel?.kind === "void"}
              legend={shownPanel?.kind === "void" ? [] : legend}
              empty={emptyStateOf(refusal, typed, session)}
              onSelect={select}
            />
          </div>
        </ToastStack>
      </main>
      {shownPanel?.kind === "void" && sale !== undefined && sale.voidability.kind === "voidable" ? (
        <VoidSalePanel
          sale={sale}
          refunds={sale.voidability.refunds}
          creditNoteCorrects={sale.voidability.credit_note_corrects}
          authorizationRequired={sale.void_authorization_required}
          loadAuthorizers={loadAuthorizers}
          voidSale={voidSale}
          onVoided={(creditNote) => {
            setPanel(undefined);
            setVoided({ creditNote });
            void refreshHistory();
          }}
          onRefused={() => void refreshHistory()}
          onSaleGone={() => {
            select(undefined);
            void refreshHistory();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {shownPanel?.kind === "reprint" && sale !== undefined ? reprintPanel(shownPanel, sale) : null}
    </RegisterFrame>
  );
}
