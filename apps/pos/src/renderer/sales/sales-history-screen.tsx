import type {
  Authorization,
  PrintCreditNoteOutcome,
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
import { EmptyState, FloatingNotification, ScreenHeader } from "@purosur/ui";
import { CircleX, Lock, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { SalesHistoryQuery } from "../platform/core-client";
import { ReprintReceiptModal } from "../shell/reprint-receipt-modal";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import { sessionEyebrow } from "../shell/session-eyebrow";
import type { SignedInPerson } from "../shell/signed-in-person";
import { voidedSaleNotice } from "./credit-note-text";
import { originalPrintNotice } from "./original-print-text";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";
import { SalesHistoryRail } from "./sales-history-rail";
import type { SessionFilter, StateFilter } from "./sales-history-table";
import { SalesHistoryTable } from "./sales-history-table";
import { useRefreshSalesHistory, useSalesHistoryQuery } from "./sales-queries";
import { VoidSaleModal } from "./void-sale-modal";

export type SalesHistoryScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
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
  printCreditNote: (saleId: string) => Promise<PrintCreditNoteOutcome>;
  reprintCreditNote: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
};

const REPRINT_STARTED_TITLES: Record<PrintedDocument, string> = {
  sale_receipt: "La reimpresión sale en cuanto la impresora esté lista",
  credit_note: "La reimpresión de la nota de crédito sale en cuanto la impresora esté lista",
};

type FilterChoice = { session: SessionFilter; state: StateFilter; page: number };

export function SalesHistoryScreen({
  person,
  registerName,
  sessionOpen,
  lock,
  salesHistory,
  saleHistoryDetail,
  reprintSaleReceipt,
  printOriginalReceipt,
  voidSale,
  printCreditNote,
  reprintCreditNote,
  loadAuthorizers,
  onSessionInvalid,
}: SalesHistoryScreenProps) {
  const [choice, setChoice] = useState<FilterChoice>({
    session: sessionOpen ? "open" : "all",
    state: "all",
    page: 1,
  });
  const [selectedSaleId, setSelectedSaleId] = useState<string>();
  const [reprinting, setReprinting] = useState<SaleDetail>();
  const [reprintingCreditNote, setReprintingCreditNote] = useState<SaleDetail>();
  const [voiding, setVoiding] = useState<SaleDetail>();
  const [voided, setVoided] = useState<{ creditNote: SaleCreditNote | null }>();
  const [originalPrint, setOriginalPrint] = useState<ReturnType<typeof originalPrintNotice>>();
  const [sent, setSent] = useState<{ copy: ReceiptCopyShown; document: PrintedDocument }>();
  const history = useSalesHistoryQuery({ ...choice, read: salesHistory });
  const refreshHistory = useRefreshSalesHistory();
  const nextCreditNoteCopy = reprintingCreditNote?.credit_note_next_copy;

  async function printOriginalOf(document: PrintedDocument, sale: SaleDetail) {
    const print = document === "sale_receipt" ? printOriginalReceipt : printCreditNote;
    const outcome = await print(sale.sale_id).catch((): "failed" => "failed");
    if (outcome === "failed") {
      setOriginalPrint(originalPrintNotice(document, "unavailable"));
      return;
    }
    switch (outcome.kind) {
      case "not_found":
      case "sale_voided":
        setSelectedSaleId(undefined);
        void refreshHistory();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      default:
        setOriginalPrint(originalPrintNotice(document, outcome.kind));
        void refreshHistory();
    }
  }

  const refusal =
    history.status === "loaded" && history.value.kind !== "found" ? history.value : undefined;

  return (
    <div className="flex h-full w-full bg-surface">
      <SalesHistoryRail
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        lock={lock}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader
          eyebrow={sessionEyebrow(registerName, sessionOpen)}
          title="Historial de ventas"
        />
        {refusal?.kind === "lacks_permission" ? (
          <EmptyState
            variant="blank"
            icon={<Lock />}
            title="No tenés permiso para ver el historial de ventas"
          />
        ) : null}
        {refusal?.kind === "not_signed_in" ? (
          <EmptyState
            variant="blank"
            icon={<TriangleAlert />}
            title="La sesión terminó. Volvé a ingresar para ver las ventas"
          />
        ) : null}
        {refusal === undefined ? (
          <SalesHistoryTable
            history={history}
            session={choice.session}
            state={choice.state}
            page={choice.page}
            selectedSaleId={selectedSaleId}
            onSessionChange={(session) => setChoice({ ...choice, session, page: 1 })}
            onStateChange={(state) => setChoice({ ...choice, state, page: 1 })}
            onPageChange={(page) => setChoice({ ...choice, page })}
            onSelect={setSelectedSaleId}
          />
        ) : null}
      </main>
      <SaleHistoryDetailPanel
        saleId={selectedSaleId}
        readDetail={saleHistoryDetail}
        onReprint={setReprinting}
        onPrintOriginal={(sale) => void printOriginalOf("sale_receipt", sale)}
        onVoid={setVoiding}
        onPrintCreditNote={(sale) => void printOriginalOf("credit_note", sale)}
        onReprintCreditNote={setReprintingCreditNote}
      />
      {reprinting === undefined || reprinting.next_copy.kind !== "duplicate" ? null : (
        <ReprintReceiptModal
          document="sale_receipt"
          sale={{ ...reprinting, next_copy: reprinting.next_copy }}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprint={reprintSaleReceipt}
          onReprinted={(copy) => {
            setReprinting(undefined);
            setSent({ copy, document: "sale_receipt" });
            void refreshHistory();
          }}
          onSaleGone={() => {
            setReprinting(undefined);
            setSelectedSaleId(undefined);
            void refreshHistory();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setReprinting(undefined)}
        />
      )}
      {reprintingCreditNote !== undefined && nextCreditNoteCopy?.kind === "duplicate" ? (
        <ReprintReceiptModal
          document="credit_note"
          sale={{ ...reprintingCreditNote, next_copy: nextCreditNoteCopy }}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprint={reprintCreditNote}
          onReprinted={(copy) => {
            setReprintingCreditNote(undefined);
            setSent({ copy, document: "credit_note" });
            void refreshHistory();
          }}
          onSaleGone={() => {
            setReprintingCreditNote(undefined);
            setSelectedSaleId(undefined);
            void refreshHistory();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setReprintingCreditNote(undefined)}
        />
      ) : null}
      {voiding === undefined || voiding.voidability.kind !== "voidable" ? null : (
        <VoidSaleModal
          sale={voiding}
          refunds={voiding.voidability.refunds}
          creditNoteCorrects={voiding.voidability.credit_note_corrects}
          authorizationRequired={voiding.void_authorization_required}
          person={person}
          loadAuthorizers={loadAuthorizers}
          voidSale={voidSale}
          onVoided={(creditNote) => {
            setVoiding(undefined);
            setVoided({ creditNote });
            void refreshHistory();
          }}
          onRefused={() => void refreshHistory()}
          onSaleGone={() => {
            setVoiding(undefined);
            setSelectedSaleId(undefined);
            void refreshHistory();
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setVoiding(undefined)}
        />
      )}
      {voided === undefined ? null : (
        <FloatingNotification
          {...voidedSaleNotice(voided.creditNote)}
          icon={<CircleX />}
          onDismiss={() => setVoided(undefined)}
        />
      )}
      {originalPrint === undefined ? null : (
        <FloatingNotification
          {...originalPrint}
          icon={originalPrint.tone === "success" ? <Printer /> : <TriangleAlert />}
          onDismiss={() => setOriginalPrint(undefined)}
        />
      )}
      {sent === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title={REPRINT_STARTED_TITLES[sent.document]}
          description={`${receiptCopyPresentation(sent.copy).comesOutAs}.`}
          onDismiss={() => setSent(undefined)}
        />
      )}
    </div>
  );
}
