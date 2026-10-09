import type { Clock, OperationAuthority, OutboxEventDraft } from "../../shared/index.js";
import { receiptContent } from "../model/receipt-content.js";
import { nextReceiptCopy, type ReceiptCopy } from "../model/receipt-copy.js";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptPrinter,
  ReceiptPrintWatch,
  ReceiptReason,
  ReceiptTemplate,
  StoredReceipt,
} from "./receipt-ports.js";
import type { IdGenerator } from "./sale-ledger.js";

export interface ReceiptPrintGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface ReceiptPrintingPorts<Grant extends ReceiptPrintGrant, Refusal> {
  ledger: ReceiptLedger;
  clock: Clock;
  ids: IdGenerator;
  template: ReceiptTemplate;
  printer: ReceiptPrinter;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ReceiptPrintOutcome =
  | { kind: "not_found" }
  | { kind: "unavailable" }
  | { kind: "printed"; copy: ReceiptCopy }
  | { kind: "abandoned"; copy: ReceiptCopy };

interface Recorded {
  copy: ReceiptCopy;
  stored: StoredReceipt;
}

export async function printReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  { ledger, clock, ids, template, printer, authority }: ReceiptPrintingPorts<Grant, Refusal>,
  saleId: string,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
): Promise<ReceiptPrintOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;

  const recorded = ledger.transaction<Recorded | ReceiptPrintOutcome>((tx) => {
    const delivery = tx.receiptDelivery(saleId);
    if (delivery === undefined) {
      return { kind: "not_found" };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }
    const copy = nextReceiptCopy(delivery);
    const at = clock.now();
    if (copy.kind === "original") {
      tx.recordPrintAttempt(saleId, at);
      tx.appendOutboxEvent(printStateEvent(ids.next(), saleId, grant, at, null));
    } else {
      tx.recordReprint({
        saleId,
        orderNumber: copy.orderNumber,
        requestedBy: grant.actorId,
        authorizedBy: grant.authorizedBy ?? null,
        reason: reasonOfDuplicate,
        occurredAt: at,
      });
      tx.appendOutboxEvent(
        reprintEvent(ids.next(), saleId, copy.orderNumber, grant, reasonOfDuplicate, at),
      );
    }
    return { copy, stored: storedReceiptOf(tx, template, saleId) };
  });
  if ("kind" in recorded) {
    return recorded;
  }

  const { copy, stored } = recorded;
  const ending = await printer.print(template.printable(stored, copy), watch);
  if (ending.kind === "abandoned") {
    return { kind: "abandoned", copy };
  }

  ledger.transaction((tx) => {
    const delivery = tx.receiptDelivery(saleId);
    if (delivery?.printAttemptedAt && delivery.printedAt === null) {
      const printedAt = clock.now();
      tx.recordPrinted(saleId, printedAt);
      tx.appendOutboxEvent(
        printStateEvent(ids.next(), saleId, grant, delivery.printAttemptedAt, printedAt),
      );
    }
  });
  return { kind: "printed", copy };
}

function storedReceiptOf(
  tx: ReceiptLedgerTransaction,
  template: ReceiptTemplate,
  saleId: string,
): StoredReceipt {
  const stored = tx.storedReceipt(saleId);
  if (stored !== undefined) {
    return stored;
  }
  const rendered = template.render(receiptContent(tx.receiptSource(saleId)));
  tx.recordStoredReceipt(saleId, rendered);
  return rendered;
}

function printStateEvent(
  eventId: string,
  saleId: string,
  { actorId }: ReceiptPrintGrant,
  printAttemptedAt: Date,
  printedAt: Date | null,
): OutboxEventDraft {
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "sale_print_state_changed",
    schema_version: 1,
    payload: {
      sale_id: saleId,
      print_attempted_at: printAttemptedAt.toISOString(),
      printed_at: printedAt?.toISOString() ?? null,
    },
    occurred_at: (printedAt ?? printAttemptedAt).toISOString(),
    actor_id: actorId,
  };
}

function reprintEvent(
  eventId: string,
  saleId: string,
  orderNumber: number,
  { actorId, authorizedBy }: ReceiptPrintGrant,
  reason: ReceiptReason,
  occurredAt: Date,
): OutboxEventDraft {
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "reprint_recorded",
    schema_version: 1,
    payload: {
      sale_id: saleId,
      order_number: orderNumber,
      requested_by: actorId,
      authorized_by: authorizedBy ?? null,
      reason_kind: reason.kind,
      reason_text: reason.kind === "requested" ? reason.text : null,
    },
    occurred_at: occurredAt.toISOString(),
    actor_id: actorId,
  };
}
