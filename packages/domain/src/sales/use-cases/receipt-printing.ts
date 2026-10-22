import type { Clock, OperationAuthority, OutboxEventDraft } from "../../shared/index.js";
import type { PrintedDocumentKey } from "../model/printed-document.js";
import { receiptContent } from "../model/receipt-content.js";
import { nextReceiptCopy, type ReceiptCopy } from "../model/receipt-copy.js";
import { receiptPrintAvailability } from "../model/receipt-print-availability.js";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptPrintEnding,
  ReceiptPrinters,
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
  printers: ReceiptPrinters;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ReceiptPrintOutcome =
  | { kind: "not_found" }
  | { kind: "sale_voided" }
  | { kind: "unavailable" }
  | { kind: "printer_not_configured" }
  | { kind: "printed"; copy: ReceiptCopy }
  | { kind: "abandoned"; copy: ReceiptCopy };

export type OriginalReceiptPrintOutcome = ReceiptPrintOutcome | { kind: "already_attempted" };

type PrintScope = "any_copy" | "original_only";

class CopyIsNoLongerTheOriginal extends Error {}

export function printReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReceiptPrintingPorts<Grant, Refusal>,
  key: PrintedDocumentKey,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
): Promise<ReceiptPrintOutcome | Refusal> {
  return printWithAuthority(ports, key, reasonOfDuplicate, watch, "any_copy");
}

export function printOriginalOnly<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReceiptPrintingPorts<Grant, Refusal>,
  key: PrintedDocumentKey,
  watch: ReceiptPrintWatch,
): Promise<OriginalReceiptPrintOutcome | Refusal> {
  return printWithAuthority(ports, key, { kind: "retry" }, watch, "original_only");
}

function printWithAuthority<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReceiptPrintingPorts<Grant, Refusal>,
  key: PrintedDocumentKey,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
  scope: "any_copy",
): Promise<ReceiptPrintOutcome | Refusal>;
function printWithAuthority<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReceiptPrintingPorts<Grant, Refusal>,
  key: PrintedDocumentKey,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
  scope: "original_only",
): Promise<OriginalReceiptPrintOutcome | Refusal>;
async function printWithAuthority<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReceiptPrintingPorts<Grant, Refusal>,
  key: PrintedDocumentKey,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
  scope: PrintScope,
): Promise<OriginalReceiptPrintOutcome | Refusal> {
  const authorization = await ports.authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  return printGrantedReceipt(ports, authorization.grant, key, reasonOfDuplicate, watch, scope);
}

async function printGrantedReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  { ledger, clock, ids, template, printers }: ReceiptPrintingPorts<Grant, Refusal>,
  grant: Grant,
  key: PrintedDocumentKey,
  reasonOfDuplicate: ReceiptReason,
  watch: ReceiptPrintWatch,
  scope: PrintScope,
): Promise<OriginalReceiptPrintOutcome> {
  const printer = printers.configured();
  if (printer === undefined) {
    return { kind: "printer_not_configured" };
  }
  const decided = ledger.transaction<ReceiptCopy | OriginalReceiptPrintOutcome>((tx) => {
    const delivery = tx.receiptDelivery(key);
    if (delivery === undefined) {
      return { kind: "not_found" };
    }
    const availability = receiptPrintAvailability(key.document, delivery);
    if (availability.kind === "sale_voided") {
      return { kind: "sale_voided" };
    }
    if (availability.kind === "credit_note_not_authorized") {
      return { kind: "not_found" };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }
    if (!isRenderable(tx, key)) {
      return { kind: "unavailable" };
    }
    const copy = nextReceiptCopy(delivery);
    return scope === "original_only" && copy.kind === "duplicate"
      ? { kind: "already_attempted" }
      : copy;
  });
  if (decided.kind !== "original" && decided.kind !== "duplicate") {
    return decided;
  }

  const handedOver: { copy?: ReceiptCopy } = {};
  const sending = () =>
    ledger.transaction((tx) => {
      const delivery = tx.receiptDelivery(key);
      if (delivery === undefined) {
        throw new Error(`sale ${key.saleId} has no ${key.document} to send`);
      }
      const copy = nextReceiptCopy(delivery);
      if (scope === "original_only" && copy.kind === "duplicate") {
        throw new CopyIsNoLongerTheOriginal();
      }
      const at = clock.now();
      if (copy.kind === "original") {
        tx.recordPrintAttempt(key, at);
      } else {
        tx.recordReprint({
          ...key,
          orderNumber: copy.orderNumber,
          requestedBy: grant.actorId,
          authorizedBy: grant.authorizedBy ?? null,
          reason: reasonOfDuplicate,
          occurredAt: at,
        });
        tx.appendOutboxEvent(
          reprintEvent(ids.next(), key, copy.orderNumber, grant, reasonOfDuplicate, at),
        );
      }
      handedOver.copy = copy;
      return template.printable(storedReceiptOf(tx, template, key), copy);
    });
  let ending: ReceiptPrintEnding;
  try {
    ending = await printer.print(watch, sending);
  } catch (error) {
    if (error instanceof CopyIsNoLongerTheOriginal) {
      return { kind: "already_attempted" };
    }
    throw error;
  }
  if (ending.kind === "abandoned") {
    return { kind: "abandoned", copy: decided };
  }
  ledger.transaction((tx) => {
    const delivery = tx.receiptDelivery(key);
    if (delivery === undefined || delivery.printedAt !== null) {
      return;
    }
    const at = clock.now();
    tx.recordPrinted(key, at);
    tx.appendOutboxEvent(
      printStateEvent(ids.next(), key, grant, delivery.printAttemptedAt ?? at, at),
    );
  });
  return { kind: "printed", copy: handedOver.copy ?? decided };
}

function isRenderable(tx: ReceiptLedgerTransaction, key: PrintedDocumentKey): boolean {
  return (
    key.document === "credit_note" ||
    tx.storedReceipt(key) !== undefined ||
    tx.receiptSource(key.saleId).fiscal.kind !== "awaiting"
  );
}

function storedReceiptOf(
  tx: ReceiptLedgerTransaction,
  template: ReceiptTemplate,
  key: PrintedDocumentKey,
): StoredReceipt {
  const stored = tx.storedReceipt(key);
  if (stored !== undefined) {
    return stored;
  }
  const rendered =
    key.document === "credit_note"
      ? template.renderCreditNote(tx.creditNoteContent(key.saleId))
      : template.render(receiptContent(tx.receiptSource(key.saleId)));
  tx.recordStoredReceipt(key, rendered);
  return rendered;
}

function printStateEvent(
  eventId: string,
  { document, saleId }: PrintedDocumentKey,
  { actorId }: ReceiptPrintGrant,
  printAttemptedAt: Date,
  printedAt: Date,
): OutboxEventDraft {
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "sale_print_state_changed",
    schema_version: 2,
    payload: {
      sale_id: saleId,
      document,
      print_attempted_at: printAttemptedAt.toISOString(),
      printed_at: printedAt.toISOString(),
    },
    occurred_at: printedAt.toISOString(),
    actor_id: actorId,
  };
}

function reprintEvent(
  eventId: string,
  { document, saleId }: PrintedDocumentKey,
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
    schema_version: 2,
    payload: {
      sale_id: saleId,
      document,
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
