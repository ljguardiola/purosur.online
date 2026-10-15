import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { EmptyState, FloatingNotification, ScreenHeader } from "@purosur/ui";
import { CircleX, Lock, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { SalesHistoryQuery } from "../platform/core-client";
import { ReprintReceiptModal } from "../shell/reprint-receipt-modal";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import { sessionEyebrow } from "../shell/session-eyebrow";
import type { SignedInPerson } from "../shell/signed-in-person";
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
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
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
  voidSale,
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
  const [voiding, setVoiding] = useState<SaleDetail>();
  const [voided, setVoided] = useState(false);
  const [sent, setSent] = useState<ReceiptCopyShown>();
  const history = useSalesHistoryQuery({ ...choice, read: salesHistory });
  const refreshHistory = useRefreshSalesHistory();

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
        onVoid={setVoiding}
      />
      {reprinting === undefined ? null : (
        <ReprintReceiptModal
          sale={reprinting}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprintSaleReceipt={reprintSaleReceipt}
          onReprinted={(copy) => {
            setReprinting(undefined);
            setSent(copy);
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
      {voiding === undefined || voiding.voidability.kind !== "voidable" ? null : (
        <VoidSaleModal
          sale={voiding}
          refunds={voiding.voidability.refunds}
          authorizationRequired={voiding.void_authorization_required}
          person={person}
          loadAuthorizers={loadAuthorizers}
          voidSale={voidSale}
          onVoided={() => {
            setVoiding(undefined);
            setVoided(true);
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
      {voided ? (
        <FloatingNotification
          tone="success"
          icon={<CircleX />}
          title="Venta anulada"
          description="La mercadería volvió al stock."
          onDismiss={() => setVoided(false)}
        />
      ) : null}
      {sent === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="La reimpresión sale en cuanto la impresora esté lista"
          description={`${receiptCopyPresentation(sent).comesOutAs}.`}
          onDismiss={() => setSent(undefined)}
        />
      )}
    </div>
  );
}
