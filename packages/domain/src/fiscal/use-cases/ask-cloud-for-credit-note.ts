import {
  type InvoicedCreditNote,
  invoiceToCorrect,
  type RequestedCreditNoteAnswer,
  tiedToInvoice,
} from "../model/sale-credit-note.js";
import { isInvoiceOnItsWay } from "../model/sale-credit-note-route.js";
import type {
  CloudCreditNoteCall,
  PendingCreditNote,
  RequestPendingCreditNotesPorts,
} from "./request-credit-notes-ports.js";

export type CreditNoteReply = RequestedCreditNoteAnswer | { kind: "in_progress" };

const IN_PROGRESS = { kind: "in_progress" } as const;
const REGULARIZATION_REQUIRED = { kind: "regularization_required" } as const;

async function invoicedCreditNote(
  { creditNotes }: RequestPendingCreditNotesPorts,
  pending: PendingCreditNote,
): Promise<
  { note: InvoicedCreditNote } | { reply: typeof IN_PROGRESS | typeof REGULARIZATION_REQUIRED }
> {
  if (pending.correctedVoucher !== null) {
    return { note: pending };
  }
  let standing = await creditNotes.saleInvoiceStanding(pending.saleId);
  if (invoiceToCorrect(standing.fiscalDocuments) === null && isInvoiceOnItsWay(standing)) {
    standing = (await creditNotes.refreshBranchSaleInvoiceStanding(pending.saleId)) ?? standing;
  }
  const invoice = invoiceToCorrect(standing.fiscalDocuments);
  if (invoice === null) {
    return { reply: isInvoiceOnItsWay(standing) ? IN_PROGRESS : REGULARIZATION_REQUIRED };
  }
  await creditNotes.tieToInvoice(pending.creditNoteId, invoice);
  return { note: tiedToInvoice(pending, invoice) };
}

export async function askCloudForCreditNote(
  ports: RequestPendingCreditNotesPorts,
  pending: PendingCreditNote,
  pointOfSale: number | null,
): Promise<CreditNoteReply> {
  const { creditNotes, cloud, clock } = ports;
  if (pointOfSale === null) {
    return IN_PROGRESS;
  }
  const invoiced = await invoicedCreditNote(ports, pending);
  if ("reply" in invoiced) {
    if (invoiced.reply.kind === "regularization_required") {
      await creditNotes.recordAnswer(pending.creditNoteId, invoiced.reply, clock.now());
    }
    return invoiced.reply;
  }
  const { note } = invoiced;
  const call: CloudCreditNoteCall = {
    creditNoteId: pending.creditNoteId,
    pointOfSale,
    saleEvent: pending.saleEvent,
    ...(note.origin.kind === "sale_return"
      ? {
          invoice: {
            voucher: note.correctedVoucher,
            buyerTaxStatusCode: note.receiverTaxStatusCode,
          },
        }
      : {}),
  };
  const reply = await cloud.request(call);
  if (reply === null || reply.kind === "in_progress") {
    return IN_PROGRESS;
  }
  await creditNotes.recordAnswer(pending.creditNoteId, reply, clock.now());
  return reply;
}
