import { latestIssuedOn, nextDeferredBacklogStep } from "../model/deferred-backlog.js";
import { deferredSaleSatisfiedEvent } from "../model/deferred-sale-satisfied-event.js";
import { isRegisterFiscallyOnline } from "../model/fiscal-online-signal.js";
import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-standing.js";
import { type PreEmissionGateFailureReason, preEmissionGate } from "../model/pre-emission-gate.js";
import { invoiceDateOf, nextInvoiceNumber } from "../model/real-time-authorization.js";
import { isBehindClockMark, raisedClockMark } from "../model/register-clock.js";
import type {
  CatchUpDeferredSalesPorts,
  DeferredSaleCatchUpTransaction,
} from "./catch-up-deferred-sales-ports.js";
import type { RequestRealTimeAuthorizationOutcome } from "./request-real-time-authorization.js";
import { requestRealTimeAuthorization } from "./request-real-time-authorization.js";

export type CatchUpStopReason =
  | { kind: "point_of_sale_missing" }
  | { kind: "numbering_frozen" }
  | { kind: "document_waiting" }
  | { kind: "clock_behind" }
  | { kind: "fiscally_offline" }
  | { kind: "awaiting_restored_numbering" }
  | { kind: "tax_authority_count_unknown" }
  | { kind: "retry_later"; until: Date }
  | { kind: "gate_failed"; reason: PreEmissionGateFailureReason }
  | {
      kind: "authorization_not_granted";
      outcome: Exclude<RequestRealTimeAuthorizationOutcome, { kind: "authorized" }>["kind"];
    };

export type CatchUpDeferredSalesOutcome =
  | { kind: "completed"; invoiced: readonly string[] }
  | { kind: "stopped"; invoiced: readonly string[]; reason: CatchUpStopReason };

type Round =
  | { kind: "reserved"; saleId: string }
  | { kind: "completed" }
  | { kind: "stopped"; reason: CatchUpStopReason };

function reserveNext(
  tx: DeferredSaleCatchUpTransaction,
  { clock, ids }: CatchUpDeferredSalesPorts,
): Round {
  const now = clock.now();
  for (const held of tx.deferredSalesHoldingAuthorizedDocument()) {
    const { origin, deferredSaleId, ...document } = held;
    tx.satisfyDeferredSale({
      saleId: held.saleId,
      fiscalDocumentId: held.fiscalDocumentId,
      satisfiedAt: now,
      event: deferredSaleSatisfiedEvent({
        eventId: ids.next(),
        ...origin,
        deferredSaleId,
        satisfiedAt: now,
        ...document,
      }),
    });
  }

  const series = tx.realTimeSeries();
  const stopped = (reason: CatchUpStopReason): Round => ({ kind: "stopped", reason });
  if (series.pointOfSale === null) {
    return stopped({ kind: "point_of_sale_missing" });
  }
  if (series.numberingFrozen) {
    return stopped({ kind: "numbering_frozen" });
  }
  if (series.documentRequesting || series.documentUnknown) {
    return stopped({ kind: "document_waiting" });
  }
  if (isBehindClockMark(now, series.clockMark)) {
    return stopped({ kind: "clock_behind" });
  }
  if (!isRegisterFiscallyOnline(tx.fiscalOnlineEvidence(), now)) {
    return stopped({ kind: "fiscally_offline" });
  }
  if (tx.awaitsRestoredNumbering()) {
    return stopped({ kind: "awaiting_restored_numbering" });
  }
  const number = nextInvoiceNumber(series);
  if (number === null) {
    return stopped({ kind: "tax_authority_count_unknown" });
  }

  const step = nextDeferredBacklogStep(
    series.deferredBacklog,
    now,
    latestIssuedOn(series.taxAuthorityLastIssuedOn, series.localLastAuthorizedIssuedOn),
  );
  if (step.kind === "empty") {
    return { kind: "completed" };
  }
  if (step.kind === "wait") {
    return stopped({ kind: "retry_later", until: step.until });
  }
  const { entry } = step;
  const gate = preEmissionGate({
    total: entry.total,
    issuer: tx.issuerIdentification(),
    buyerTaxStatuses: tx.buyerTaxStatuses(),
  });
  if (gate.kind === "failed") {
    return stopped({ kind: "gate_failed", reason: gate.reason });
  }
  tx.reserveFiscalDocument({
    id: ids.next(),
    saleId: entry.saleId,
    pointOfSale: series.pointOfSale,
    number,
    issuedOn: invoiceDateOf(entry.occurredAt),
    document: gate.document,
    reservedAt: now,
  });
  tx.recordClockMark({
    pointOfSale: series.pointOfSale,
    documentType: FACTURA_C_DOCUMENT_TYPE,
    reading: raisedClockMark(series.clockMark, now),
  });
  return { kind: "reserved", saleId: entry.saleId };
}

export async function catchUpDeferredSales(
  ports: CatchUpDeferredSalesPorts,
): Promise<CatchUpDeferredSalesOutcome> {
  const invoiced: string[] = [];
  for (;;) {
    const round = ports.catchUp.transaction((tx) => reserveNext(tx, ports));
    if (round.kind === "completed") {
      return { kind: "completed", invoiced };
    }
    if (round.kind === "stopped") {
      return { kind: "stopped", invoiced, reason: round.reason };
    }
    const authorization = await requestRealTimeAuthorization(ports, { saleId: round.saleId });
    if (authorization.kind !== "authorized") {
      return {
        kind: "stopped",
        invoiced,
        reason: { kind: "authorization_not_granted", outcome: authorization.kind },
      };
    }
    invoiced.push(round.saleId);
  }
}
