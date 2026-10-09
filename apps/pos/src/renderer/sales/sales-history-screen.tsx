import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { EmptyState, FloatingNotification, ScreenHeader } from "@purosur/ui";
import { Lock, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { SalesHistoryQuery } from "../platform/core-client";
import { HistoryRail } from "../shell/history-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import { ReprintReceiptModal } from "./reprint-receipt-modal";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";
import type { SaleDetail } from "./sale-history-text";
import { receiptCopyPresentation } from "./sale-history-text";
import type { SessionFilter, StateFilter } from "./sales-history-table";
import { SalesHistoryTable } from "./sales-history-table";
import { useRefreshSalesHistory, useSalesHistoryQuery } from "./sales-queries";

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
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
};

type FilterChoice = { session: SessionFilter; state: StateFilter; page: number };

function eyebrowText(registerName: string | null, sessionOpen: boolean): string {
  const scope = sessionOpen ? "Ventas de esta caja" : "Sin sesión abierta";
  return registerName === null ? scope : `${registerName} · ${scope}`;
}

export function SalesHistoryScreen({
  person,
  registerName,
  sessionOpen,
  lock,
  salesHistory,
  saleHistoryDetail,
  reprintSaleReceipt,
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
  const [sent, setSent] = useState<ReceiptCopyShown>();
  const history = useSalesHistoryQuery({ ...choice, read: salesHistory });
  const refreshHistory = useRefreshSalesHistory();

  const refusal =
    history.status === "loaded" && history.value.kind !== "found" ? history.value : undefined;

  return (
    <div className="flex h-full w-full bg-surface">
      <HistoryRail
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        lock={lock}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader
          eyebrow={eyebrowText(registerName, sessionOpen)}
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
      {sent === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="Se mandó la reimpresión a la impresora"
          description={`${receiptCopyPresentation(sent).comesOutAs}.`}
          onDismiss={() => setSent(undefined)}
        />
      )}
    </div>
  );
}
