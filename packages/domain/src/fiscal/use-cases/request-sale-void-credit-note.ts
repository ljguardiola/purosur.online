import type { PushedEvent } from "../../sync/index.js";
import type { CreditNoteAnswer } from "../model/sale-void-credit-note.js";
import { saleVoidCreditNoteOfEvent } from "../model/sale-void-credit-note.js";
import type { CreditNote } from "./credit-note-ports.js";
import {
  type RequestSaleVoidCreditNotePorts,
  VoucherAlreadyCredited,
} from "./sale-void-credit-note-ports.js";

export interface RequestSaleVoidCreditNoteInput {
  registerId: string;
  request: {
    creditNoteId: string;
    pointOfSale: number;
    saleEvent: PushedEvent;
  };
  receivedAt: Date;
}

export type RequestSaleVoidCreditNoteOutcome =
  | { kind: "recorded" }
  | { kind: "already_recorded"; answer: CreditNoteAnswer }
  | { kind: "sale_event_mismatch" }
  | { kind: "point_of_sale_not_owned" }
  | { kind: "credit_note_not_owned" }
  | { kind: "voucher_not_owned" }
  | { kind: "voucher_already_credited" };

function answerOf({ pointOfSale, standing }: CreditNote): CreditNoteAnswer {
  switch (standing.kind) {
    case "authorized": {
      const { kind: _kind, ...authorized } = standing;
      return { kind: "authorized", pointOfSale, ...authorized };
    }
    case "rejected":
      return { kind: "rejected" };
    case "not_requested":
    case "requested":
      return { kind: "in_progress" };
  }
}

export async function requestSaleVoidCreditNote(
  { lanes }: RequestSaleVoidCreditNotePorts,
  { registerId, request, receivedAt }: RequestSaleVoidCreditNoteInput,
): Promise<RequestSaleVoidCreditNoteOutcome> {
  const asked = saleVoidCreditNoteOfEvent(request.saleEvent);
  if (asked === null || asked.creditNoteId !== request.creditNoteId) {
    return { kind: "sale_event_mismatch" };
  }

  return lanes.inPointOfSaleLane<RequestSaleVoidCreditNoteOutcome>(
    request.pointOfSale,
    async (lane) => {
      if (!(await lane.registerOwnsPointOfSale(registerId, request.pointOfSale))) {
        return { kind: "point_of_sale_not_owned" };
      }

      const recorded = await lane.recordedCreditNote(request.creditNoteId);
      if (recorded !== null) {
        return recorded.registerId === registerId
          ? { kind: "already_recorded", answer: answerOf(recorded.creditNote) }
          : { kind: "credit_note_not_owned" };
      }

      if (
        !(await lane.registerIssuesFromPointOfSale(registerId, asked.correctedVoucher.pointOfSale))
      ) {
        return { kind: "voucher_not_owned" };
      }
      try {
        await lane.recordSaleVoidCreditNote({
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
        if (error instanceof VoucherAlreadyCredited) {
          return { kind: "voucher_already_credited" };
        }
        throw error;
      }
      return { kind: "recorded" };
    },
  );
}
