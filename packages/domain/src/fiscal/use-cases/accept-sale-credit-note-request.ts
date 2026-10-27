import type { PushedEvent } from "../../sync/index.js";
import {
  type CreditNoteAnswer,
  type CreditNoteToIssue,
  creditNoteAnswerOf,
} from "../model/sale-credit-note.js";
import {
  type AcceptSaleCreditNoteRequestPorts,
  CreditNoteIdTaken,
  VoucherAlreadyCredited,
} from "./accept-sale-credit-note-request-ports.js";

export interface AcceptSaleCreditNoteRequestInput {
  deviceId: string;
  registerId: string;
  request: {
    creditNoteId: string;
    pointOfSale: number;
    voided: CreditNoteToIssue;
    saleEvent: PushedEvent;
  };
  receivedAt: Date;
}

export type AcceptSaleCreditNoteRequestOutcome =
  | { kind: "recorded" }
  | { kind: "already_recorded"; answer: CreditNoteAnswer }
  | { kind: "sale_event_mismatch" }
  | { kind: "point_of_sale_not_owned" }
  | { kind: "credit_note_not_owned" }
  | { kind: "voucher_not_owned" }
  | { kind: "voucher_already_credited" };

export async function acceptSaleCreditNoteRequest(
  { lanes, attachedSaleEvents }: AcceptSaleCreditNoteRequestPorts,
  { deviceId, registerId, request, receivedAt }: AcceptSaleCreditNoteRequestInput,
): Promise<AcceptSaleCreditNoteRequestOutcome> {
  const asked = request.voided;
  if (asked.creditNoteId !== request.creditNoteId) {
    return { kind: "sale_event_mismatch" };
  }

  await attachedSaleEvents.record(deviceId, request.saleEvent);

  return lanes.inPointOfSaleLane<AcceptSaleCreditNoteRequestOutcome>(
    request.pointOfSale,
    async (lane) => {
      if (!(await lane.registerOwnsPointOfSale(registerId, request.pointOfSale))) {
        return { kind: "point_of_sale_not_owned" };
      }

      const recorded = await lane.recordedCreditNote(registerId, request.creditNoteId);
      if (recorded !== null) {
        return {
          kind: "already_recorded",
          answer: creditNoteAnswerOf(recorded.standing, recorded.pointOfSale),
        };
      }

      if (
        !(await lane.registerIssuesFromPointOfSale(registerId, asked.correctedVoucher.pointOfSale))
      ) {
        return { kind: "voucher_not_owned" };
      }
      try {
        await lane.recordSaleCreditNote({
          creditNoteId: asked.creditNoteId,
          registerId,
          saleId: asked.saleId,
          pointOfSale: request.pointOfSale,
          correctedVoucher: asked.correctedVoucher,
          total: asked.total,
          receiverTaxStatusCode: asked.receiverTaxStatusCode,
          receivedAt,
        });
      } catch (error) {
        if (error instanceof CreditNoteIdTaken) {
          return { kind: "credit_note_not_owned" };
        }
        if (error instanceof VoucherAlreadyCredited) {
          await lane.raiseInvoiceAlreadyCredited(
            { voucher: asked.correctedVoucher, saleId: asked.saleId },
            receivedAt,
          );
          await lane.keepAlreadyCreditedRefusal(
            { creditNoteId: asked.creditNoteId, registerId, saleId: asked.saleId },
            receivedAt,
          );
          return { kind: "voucher_already_credited" };
        }
        throw error;
      }
      return { kind: "recorded" };
    },
  );
}
