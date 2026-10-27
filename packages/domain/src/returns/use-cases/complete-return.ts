import {
  type CreditNoteToIssue,
  creditNoteToIssuePayload,
  invoiceToCorrect,
  isInvoiceOnItsWay,
  issueOfflineSaleCreditNote,
  routeSaleCreditNote,
  type SaleCreditNoteRoute,
} from "../../fiscal/index.js";
import { plannedRefundState } from "../../payments/index.js";
import {
  type Clock,
  type JsonValue,
  type OperationAuthority,
  type OutboxEventDraft,
  SALE_RETURNED_EVENT_TYPE,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type RefundAllocation,
  type RefundAllocationRefusal,
  refundAllocationRefusal,
} from "../model/refund-allocation.js";
import {
  acceptedLines,
  assessReturnDraft,
  firstLineRefusal,
  type ReturnDraftLine,
  type ReturnLineRefusal,
  refundableTotal,
} from "../model/return-draft.js";
import type { TicketSource } from "../model/return-reasons.js";
import { returnSaleLines } from "../model/return-sale.js";
import { returnStockDelta, returnStockMovements } from "../model/return-stock.js";
import type { ReturnedLine, ReturnedRefund } from "../model/returned-sale.js";
import type {
  IdGenerator,
  RecordedReturn,
  ReturnCashMovement,
  ReturnLedger,
  ReturnRefund,
  ReturnStockMovement,
} from "./return-ports.js";

export interface CompleteReturnInput {
  saleId: string;
  ticketSource: TicketSource;
  lines: readonly ReturnDraftLine[];
  refunds: readonly RefundAllocation[];
}

export interface CompleteReturnGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface CompleteReturnPorts<Grant extends CompleteReturnGrant, Refusal> {
  ledger: ReturnLedger;
  clock: Clock;
  zoneRules: ZoneRulesSource;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

type ReturnCreditNote =
  | { kind: "none" }
  | { kind: "pending" | "awaiting_invoice" | "issued_offline"; creditNoteId: string };

export type CompleteReturnOutcome<Grant extends CompleteReturnGrant> =
  | { kind: "not_found" }
  | { kind: "sale_not_returnable" }
  | { kind: "no_open_session" }
  | { kind: "no_lines" }
  | { kind: "line_refused"; saleLineId: string; refusal: ReturnLineRefusal }
  | { kind: "refund_refused"; refusal: RefundAllocationRefusal }
  | { kind: "unavailable" }
  | {
      kind: "completed";
      returnId: string;
      refundedTotal: number;
      refunds: ReturnedRefund[];
      creditNote: ReturnCreditNote;
      grant: Grant;
    };

export async function completeReturn<Grant extends CompleteReturnGrant, Refusal>(
  { ledger, clock, zoneRules, ids, authority }: CompleteReturnPorts<Grant, Refusal>,
  { saleId, ticketSource, lines, refunds }: CompleteReturnInput,
): Promise<CompleteReturnOutcome<Grant> | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;

  return ledger.transaction<CompleteReturnOutcome<Grant>>((tx) => {
    const facts = tx.saleForReturn({ kind: "sale", saleId });
    if (facts === undefined) {
      return { kind: "not_found" };
    }
    const { sale } = facts;
    if (sale.state !== "COMPLETED") {
      return { kind: "sale_not_returnable" };
    }
    const session = tx.openSession();
    if (session === undefined) {
      return { kind: "no_open_session" };
    }
    if (lines.length === 0) {
      return { kind: "no_lines" };
    }
    const occurredAt = clock.now();
    const rules = zoneRules.zoneRules();
    const standing = returnSaleLines(facts);
    const assessed = assessReturnDraft(
      {
        soldAt: facts.occurredAt,
        goodConditionReturnDays: tx.goodConditionReturnDays(),
        now: occurredAt,
        rules,
        lines: standing,
      },
      lines,
    );
    const lineRefusal = firstLineRefusal(assessed);
    if (lineRefusal !== null) {
      return { kind: "line_refused", ...lineRefusal };
    }
    const refundedTotal = refundableTotal(assessed);
    const refundRefusal = refundAllocationRefusal(facts.payments, refunds, refundedTotal);
    if (refundRefusal !== null) {
      return { kind: "refund_refused", refusal: refundRefusal };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    const returnId = ids.next();
    const accepted = acceptedLines(assessed);
    const returning = standing.flatMap((line) => {
      const entry = accepted.find(({ saleLineId }) => saleLineId === line.id);
      return entry === undefined ? [] : [{ line, entry }];
    });
    const returnedLines: ReturnedLine[] = returning.map(({ line, entry }) => ({
      saleLineId: line.id,
      productId: line.productId,
      quantity: entry.quantity,
      reason: entry.reason,
      disposition: entry.disposition,
      refundedAmount: entry.refundAmount,
    }));
    const authorizedBy = grant.authorizedBy ?? null;
    const record: RecordedReturn = {
      id: returnId,
      saleId: sale.id,
      sessionId: session.id,
      actorId: grant.actorId,
      authorizedBy,
      ticketSource,
      occurredAt,
      refundedTotal,
      lines: returnedLines,
    };
    tx.recordReturn(record);

    const imputed = new Map<string, number>();
    for (const { paymentId, amount } of refunds) {
      imputed.set(paymentId, (imputed.get(paymentId) ?? 0) + amount);
    }
    const recordedRefunds: ReturnRefund[] = [];
    for (const payment of facts.payments) {
      const amount = imputed.get(payment.id);
      if (amount !== undefined) {
        recordedRefunds.push({
          id: ids.next(),
          returnId,
          saleId: sale.id,
          paymentId: payment.id,
          method: payment.method,
          provider: payment.provider,
          amount,
          state: plannedRefundState(payment.method),
          occurredAt,
        });
      }
    }
    for (const refund of recordedRefunds) {
      tx.recordRefund(refund);
    }
    const cashMovements: ReturnCashMovement[] = [];
    if (refundedTotal > 0) {
      const movement: ReturnCashMovement = {
        id: ids.next(),
        sessionId: session.id,
        type: "REFUND",
        amount: refundedTotal,
        actorId: grant.actorId,
        occurredAt,
        ref: { type: "return", id: returnId },
        ...(grant.authorizedBy === undefined ? {} : { authorizedBy: grant.authorizedBy }),
      };
      cashMovements.push(movement);
      tx.recordCashMovement(movement);
    }
    const stockMovements: ReturnStockMovement[] = [];
    for (const { line, entry } of returning) {
      const delta = returnStockDelta(line.saleUnit, entry.quantity);
      for (const planned of returnStockMovements(entry.disposition, delta)) {
        const movement: ReturnStockMovement = {
          id: ids.next(),
          returnId,
          saleLineId: line.id,
          productId: line.productId,
          kind: planned.kind,
          reason: planned.reason,
          delta: planned.delta,
          occurredAt,
        };
        stockMovements.push(movement);
        tx.recordReturnStockMovement(movement);
        tx.addToStockBalance(movement.productId, movement.delta);
      }
    }
    const invoiceStanding = tx.saleInvoiceStanding(sale.id);
    const route = routeSaleCreditNote(
      {
        occurredAt,
        saleId: sale.id,
        total: refundedTotal,
        origin: { kind: "sale_return", returnId },
        invoice: invoiceToCorrect(invoiceStanding.fiscalDocuments),
        invoiceOnItsWay: isInvoiceOnItsWay(invoiceStanding),
        nextCreditNoteId: () => ids.next(),
      },
      tx,
      rules,
    );
    const creditNote = route.kind === "none" ? null : route.creditNote;
    if (route.kind === "pending" || route.kind === "awaiting_invoice") {
      tx.recordPendingCreditNote(route.creditNote);
    }
    tx.appendOutboxEvent(
      saleReturnedEvent(ids.next(), {
        record,
        registerId: sale.registerId,
        deviceId: sale.deviceId,
        refunds: recordedRefunds,
        cashMovements,
        stockMovements,
        creditNote,
      }),
    );
    if (route.kind === "issue_offline") {
      issueOfflineSaleCreditNote(route, tx, {
        nextId: () => ids.next(),
        registerId: sale.registerId,
        actorId: grant.actorId,
        generatedAt: occurredAt,
        rules,
      });
    }
    return {
      kind: "completed",
      returnId,
      refundedTotal,
      refunds: recordedRefunds.map(({ returnId: _returnId, saleId: _saleId, ...refund }) => refund),
      creditNote: returnCreditNote(route),
      grant,
    };
  });
}

function returnCreditNote(route: SaleCreditNoteRoute): ReturnCreditNote {
  switch (route.kind) {
    case "none":
      return { kind: "none" };
    case "issue_offline":
      return { kind: "issued_offline", creditNoteId: route.creditNote.creditNoteId };
    case "pending":
    case "awaiting_invoice":
      return { kind: route.kind, creditNoteId: route.creditNote.creditNoteId };
  }
}

interface Returning {
  record: RecordedReturn;
  registerId: string;
  deviceId: string;
  refunds: readonly ReturnRefund[];
  cashMovements: readonly ReturnCashMovement[];
  stockMovements: readonly ReturnStockMovement[];
  creditNote: CreditNoteToIssue | null;
}

function saleReturnedEvent(
  eventId: string,
  { record, registerId, deviceId, refunds, cashMovements, stockMovements, creditNote }: Returning,
): OutboxEventDraft {
  const occurredAt = record.occurredAt.toISOString();
  const payload: { [member: string]: JsonValue } = {
    id: record.id,
    sale_id: record.saleId,
    register_id: registerId,
    device_id: deviceId,
    session_id: record.sessionId,
    actor_id: record.actorId,
    authorized_by: record.authorizedBy,
    ticket_source: record.ticketSource,
    occurred_at: occurredAt,
    credit_note: creditNote === null ? null : creditNoteToIssuePayload(creditNote),
    lines: record.lines.map((line) => ({
      sale_line_id: line.saleLineId,
      product_id: line.productId,
      quantity: line.quantity,
      reason: line.reason,
      disposition: line.disposition,
      refunded_amount: line.refundedAmount,
    })),
    refunds: refunds.map((refund) => ({
      id: refund.id,
      kind: "REFUND",
      parent_id: refund.paymentId,
      method: refund.method,
      provider: refund.provider,
      amount: refund.amount,
      state: refund.state,
      occurred_at: refund.occurredAt.toISOString(),
    })),
    cash_movements: cashMovements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: movement.amount,
      ref_type: movement.ref.type,
      ref_id: movement.ref.id,
      actor_id: movement.actorId,
      occurred_at: movement.occurredAt.toISOString(),
    })),
    stock_movements: stockMovements.map((movement) => ({
      id: movement.id,
      sale_line_id: movement.saleLineId,
      product_id: movement.productId,
      kind: movement.kind,
      reason: movement.reason,
      delta: movement.delta,
      occurred_at: movement.occurredAt.toISOString(),
    })),
  };
  return {
    event_id: eventId,
    aggregate_type: "Return",
    aggregate_id: record.id,
    event_type: SALE_RETURNED_EVENT_TYPE,
    schema_version: 2,
    payload,
    occurred_at: occurredAt,
    actor_id: record.actorId,
  };
}
