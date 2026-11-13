import type {
  CompleteReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
} from "@purosur/contracts";
import {
  formatCents,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
  SearchField,
} from "@purosur/ui";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CompleteReturnInput } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { paidPaymentName } from "../platform/payment-method-names";
import { AuthorizationModal } from "../shell/authorization-modal";
import { RegisterFrame } from "../shell/register-frame";
import type { AuthorizationState } from "../shell/use-authorization";
import type { CompletedReturn } from "./hand-over-refund-modal";
import { ownEntry } from "./own-entry";
import type { ReturnDraft, ReturnDraftLine } from "./return-form";
import {
  checkLine,
  draftLineOf,
  draftLinesFor,
  EMPTY_RETURN_DRAFT,
  INVALID_REFUND_MESSAGE,
  refundsOf,
  refundTextsFor,
  returnRequestFrom,
  returnRequestSchema,
  uncheckLine,
} from "./return-form";
import { ReturnLinePanel } from "./return-line-panel";
import { ReturnLinesTable } from "./return-lines-table";
import { ReturnRefundsPanel } from "./return-refunds-panel";
import { ReturnRefundsTable } from "./return-refunds-table";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import { ReturnSummaryPanel } from "./return-summary-panel";
import {
  lineRefusalNotice,
  quantityText,
  REFUND_WHEN_IN_ROW,
  refundRefusalText,
} from "./return-text";
import { useReturnDraftPreviewQuery } from "./returns-queries";

const COMPLETE_FAILED = "No se pudo completar la devolución. Probá de nuevo.";
const SALE_GONE = "Esa venta ya no se puede devolver.";
const NOT_PERMITTED = "No tenés permiso para hacer devoluciones.";
const TICKET_NOT_VERIFIED = "Marcá Ticket verificado para completar la devolución.";

const EDIT_LEGEND = [
  { keyName: "Digits", label: "Cantidad" },
  { keyName: "Tab", label: "Campo" },
  { keyName: "ArrowLeftRight", label: "Opción" },
  { keyName: "Enter", label: "Aplicar" },
] as const;

export type ReturnBuildStepProps = {
  rail: ReactNode;
  sale: SaleForReturn;
  source: CompleteReturnInput["ticketSource"];
  verificationRequired: boolean;
  authorization: AuthorizationState;
  finished: boolean;
  previewReturn: (
    saleId: string,
    lines: readonly ReturnDraftLineBody[],
  ) => Promise<PreviewReturnOutcome>;
  completeReturn: (input: CompleteReturnInput) => Promise<CompleteReturnOutcome>;
  onAuthorizationRequired: () => void;
  onCompleted: (completed: CompletedReturn) => void;
  onLeave: () => void;
  onSessionInvalid: () => void;
};

type Mode = { kind: "list" } | { kind: "edit"; lineId: string } | { kind: "refunds" };

function lineOf(sale: SaleForReturn, lineId: string): SaleLineForReturn | undefined {
  return sale.lines.find(({ id }) => id === lineId);
}

export function ReturnBuildStep({
  rail,
  sale,
  source,
  verificationRequired,
  authorization,
  finished,
  previewReturn,
  completeReturn,
  onAuthorizationRequired,
  onCompleted,
  onLeave,
  onSessionInvalid,
}: ReturnBuildStepProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [draft, setDraft] = useState<ReturnDraft>(EMPTY_RETURN_DRAFT);
  const [refundEdits, setRefundEdits] = useState<Readonly<Record<string, string>>>({});
  const [selectedLineId, setSelectedLineId] = useState(sale.lines[0]?.id);
  const [selectedRefund, setSelectedRefund] = useState(0);
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);

  const lines = draftLinesFor(sale, draft);
  const preview = useReturnDraftPreviewQuery({ sale, draft, preview: previewReturn });
  const answered = lines.length > 0 && preview.status === "loaded" ? preview.value : undefined;
  const previewed = answered?.kind === "previewed" ? answered : undefined;
  const previewRefreshing = preview.status === "loaded" && preview.refreshing;
  const previewSignedOut = answered?.kind === "not_signed_in";

  useEffect(() => {
    if (previewSignedOut) {
      onSessionInvalid();
    }
  }, [previewSignedOut, onSessionInvalid]);

  const previewedLines = Object.fromEntries(
    (previewed?.lines ?? []).map((line) => [line.sale_line_id, line]),
  );
  const firstRefusal = previewed?.lines.find((line) => line.refusal !== null);
  const refusedLine =
    firstRefusal === undefined ? undefined : lineOf(sale, firstRefusal.sale_line_id);
  const refundableTotal = previewed?.refundable_total ?? 0;
  const refundTexts = refundTextsFor(sale.payments, refundableTotal, refundEdits);
  const eligiblePayments = refundTexts.filter(({ payment }) => payment.eligible);
  const needsVerification = verificationRequired && !verified;
  const canComplete =
    !submitting &&
    previewed !== undefined &&
    !previewRefreshing &&
    firstRefusal === undefined &&
    !needsVerification;

  const paymentRows = refundsOf(refundTexts).flatMap(({ payment_id: paymentId, amount }) => {
    const payment = sale.payments.find((candidate) => candidate.payment_id === paymentId);
    return payment === undefined || !Number.isFinite(amount) || amount <= 0
      ? []
      : [
          {
            label: `${paidPaymentName(payment.method, payment.card_type)} · ${REFUND_WHEN_IN_ROW[payment.refund_state]}`,
            value: formatCents(amount),
          },
        ];
  });

  function change(next: ReturnDraft) {
    setDraft(next);
    setRefundEdits({});
    setNotice(undefined);
  }

  async function complete() {
    if (sending.current || previewed === undefined) {
      return;
    }
    const request = returnRequestFrom(sale, refundableTotal, {
      lines: draft,
      refunds: refundEdits,
    });
    if (!returnRequestSchema.safeParse(request).success) {
      setNotice(INVALID_REFUND_MESSAGE);
      return;
    }
    sending.current = true;
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await completeReturn({
      saleId: sale.sale_id,
      ticketSource: source,
      ticketVerified: verificationRequired && verified,
      lines: request.lines,
      refunds: request.refunds,
      authorization: authorization.value,
    }).catch((): "failed" => "failed");
    sending.current = false;
    setSubmitting(false);
    authorization.dismiss();
    if (outcome === "failed") {
      setNotice(COMPLETE_FAILED);
      return;
    }
    switch (outcome.kind) {
      case "completed":
        authorization.performed();
        onCompleted({
          cashToHandOver: outcome.refunded_in_cash,
          pendingRefunds: outcome.refunds
            .filter(({ state }) => state === "PENDING")
            .map((refund) => ({
              id: refund.payment_id,
              name: paidPaymentName(
                refund.method,
                sale.payments.find(({ payment_id }) => payment_id === refund.payment_id)
                  ?.card_type ?? null,
              ),
              amount: refund.amount,
              sentByCloud: refund.sent_by_cloud,
            })),
          lines: previewed.lines.flatMap((line) => {
            const sold = lineOf(sale, line.sale_line_id);
            return sold === undefined || line.disposition === null || line.resolution === null
              ? []
              : [
                  {
                    id: sold.id,
                    name: sold.product_name,
                    quantity: quantityText(sold.sale_unit, line.quantity),
                    disposition: line.disposition,
                    resolution: line.resolution,
                    amount: line.refund_amount ?? 0,
                  },
                ];
          }),
        });
        break;
      case "ticket_not_verified":
        setNotice(TICKET_NOT_VERIFIED);
        break;
      case "not_found":
      case "sale_not_returnable":
        setNotice(SALE_GONE);
        break;
      case "no_open_session":
        setNotice("No hay una caja abierta para entregar el dinero.");
        break;
      case "no_lines":
        setNotice("Elegí al menos una línea para devolver.");
        break;
      case "line_refused": {
        const refused = lineOf(sale, outcome.sale_line_id);
        setNotice(
          refused === undefined ? COMPLETE_FAILED : lineRefusalNotice(outcome.refusal, refused),
        );
        break;
      }
      case "refund_refused":
        setNotice(refundRefusalText(outcome.refusal));
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "lacks_permission":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          onAuthorizationRequired();
          authorization.ask();
        }
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "unavailable":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          setNotice(COMPLETE_FAILED);
        }
        break;
    }
  }

  function completeOrAsk() {
    if (!canComplete) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    void complete();
  }

  function continueToComplete() {
    if (!canComplete) {
      return;
    }
    if (eligiblePayments.length > 1) {
      setNotice(undefined);
      setSelectedRefund(0);
      setMode({ kind: "refunds" });
      return;
    }
    completeOrAsk();
  }

  function moveSelection(pressed: string) {
    const index = sale.lines.findIndex(({ id }) => id === selectedLineId);
    const next = sale.lines[pressed === "ArrowDown" ? index + 1 : index - 1];
    if (next !== undefined) {
      setSelectedLineId(next.id);
    }
  }

  function mark(lineId: string, marked: boolean) {
    const line = lineOf(sale, lineId);
    if (line === undefined || line.returnable_quantity === 0) {
      return;
    }
    change(marked ? checkLine(draft, line) : uncheckLine(draft, lineId));
  }

  function markSelected() {
    if (selectedLineId !== undefined) {
      mark(selectedLineId, ownEntry(draft, selectedLineId) === undefined);
    }
  }

  function editSelected() {
    const line = selectedLineId === undefined ? undefined : lineOf(sale, selectedLineId);
    if (line !== undefined && line.returnable_quantity > 0) {
      setMode({ kind: "edit", lineId: line.id });
    }
  }

  function apply(lineId: string, edit: ReturnDraftLine) {
    change({ ...draft, [lineId]: edit });
    setMode({ kind: "list" });
  }

  function moveRefund(pressed: string) {
    const last = eligiblePayments.length - 1;
    setSelectedRefund(
      pressed === "ArrowDown"
        ? Math.min(selectedRefund + 1, last)
        : Math.max(selectedRefund - 1, 0),
    );
  }

  const listActive = mode.kind === "list" && !finished;
  const legend = useKeys(
    [
      { key: "ArrowUpDown", label: "Líneas", run: moveSelection, enabled: !submitting },
      { key: "Space", label: "Marcar", run: markSelected, enabled: !submitting },
      { key: "F6", label: "Editar", run: editSelected, enabled: !submitting },
      {
        key: "T",
        label: "Verificar",
        run: () => setVerified(!verified),
        enabled: verificationRequired && firstRefusal === undefined && !submitting,
      },
      { key: "Enter", label: "Completar", run: continueToComplete, enabled: canComplete },
      { key: "Escape", run: onLeave, enabled: !submitting },
    ],
    { active: listActive },
  );
  const refundLegend = useKeys(
    [
      { key: "ArrowUpDown", label: "Medio", run: moveRefund, enabled: !submitting },
      { key: "Enter", label: "Finalizar", run: completeOrAsk, enabled: !submitting },
      {
        key: "Escape",
        run: () => {
          setNotice(undefined);
          setMode({ kind: "list" });
        },
        enabled: !submitting,
      },
    ],
    { active: mode.kind === "refunds" && !finished },
  );

  const authorizer =
    authorization.authorizers.status === "loaded"
      ? authorization.authorizers.value.find(({ id }) => id === authorization.chosen)
      : undefined;
  const authorizedBy =
    authorization.value !== undefined && authorization.refusal === undefined
      ? authorizer
      : undefined;
  const panelNotice =
    firstRefusal?.refusal != null && refusedLine !== undefined
      ? lineRefusalNotice(firstRefusal.refusal, refusedLine)
      : answered?.kind === "not_found" || answered?.kind === "sale_not_returnable"
        ? SALE_GONE
        : answered?.kind === "lacks_permission"
          ? NOT_PERMITTED
          : notice;
  const total =
    lines.length === 0
      ? 0
      : preview.status === "loaded" && previewed !== undefined
        ? refundableTotal
        : undefined;
  const linesCount =
    previewed === undefined
      ? lines.length
      : previewed.lines.filter(({ refusal }) => refusal === null).length;
  const authorizationModal: ReactNode = (
    <AuthorizationModal
      authorization={authorization}
      subtitle="Devolución"
      action="hacer devoluciones"
      submitting={submitting}
      onConfirm={completeOrAsk}
    />
  );
  const editedLine = mode.kind === "edit" ? lineOf(sale, mode.lineId) : undefined;
  const searchText =
    sale.invoice === null
      ? ""
      : `${formatPointOfSaleNumber(sale.invoice.point_of_sale)}-${formatInvoiceNumber(sale.invoice.number)}`;
  return (
    <RegisterFrame
      background="subtle"
      rail={rail}
      aside={
        editedLine !== undefined ? (
          <ReturnLinePanel
            sale={sale}
            line={editedLine}
            draft={ownEntry(draft, editedLine.id) ?? draftLineOf(editedLine)}
            refund={ownEntry(previewedLines, editedLine.id)?.refund_amount}
            onApply={(edit) => apply(editedLine.id, edit)}
            onCancel={() => setMode({ kind: "list" })}
          />
        ) : mode.kind === "refunds" ? (
          <ReturnRefundsPanel
            total={refundableTotal}
            rows={paymentRows}
            submitting={submitting}
            onFinish={completeOrAsk}
          >
            {authorizationModal}
          </ReturnRefundsPanel>
        ) : (
          <ReturnSummaryPanel
            sale={sale}
            total={total}
            totalFailed={
              lines.length > 0 && preview.status === "failed" ? { retry: preview.retry } : undefined
            }
            linesCount={linesCount}
            paymentRows={paymentRows}
            notice={panelNotice}
            authorizedBy={authorizedBy?.first_name}
            verification={
              verificationRequired ? { checked: verified, onChange: setVerified } : undefined
            }
            canComplete={canComplete}
            submitting={submitting}
            onComplete={continueToComplete}
          >
            {authorizationModal}
          </ReturnSummaryPanel>
        )
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-8 pt-4 pb-6">
        <SearchField
          placeholder="Escaneá el ticket o escribí el número"
          icon={<Search />}
          value={searchText}
          onChange={() => {}}
          disabled={mode.kind === "refunds"}
        />
        {mode.kind === "refunds" ? (
          <ReturnRefundsTable
            sale={sale}
            refundableTotal={refundableTotal}
            refundEdits={refundEdits}
            selectedIndex={selectedRefund}
            legend={refundLegend}
            notice={notice}
            onSelect={setSelectedRefund}
            onAmountChange={(id, amount) => setRefundEdits({ ...refundEdits, [id]: amount })}
          />
        ) : (
          <ReturnLinesTable
            sale={sale}
            draft={draft}
            previewed={previewed}
            selectedLineId={selectedLineId}
            legend={mode.kind === "edit" ? EDIT_LEGEND : legend}
            onSelect={setSelectedLineId}
            onMark={mark}
          />
        )}
      </main>
    </RegisterFrame>
  );
}
