import {
  type SaleVoidCreditNoteRequestBody,
  saleVoidCreditNoteResponseSchema,
} from "@purosur/contracts";
import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type {
  CloudCreditNoteAnswer,
  CloudCreditNoteCall,
  CloudCreditNotes as CloudCreditNotesPort,
} from "@purosur/domain/fiscal/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudCreditNotesDeps {
  timeoutMs: number;
  readDeviceToken: () => Promise<string | undefined>;
  post: (
    path: string,
    bearerToken: string,
    body: unknown,
    options: CloudCallOptions,
  ) => Promise<CloudResponse>;
}

function answerOf(response: CloudResponse): CloudCreditNoteAnswer | null {
  if (response.kind === "error" && response.error.code === "conflict") {
    return { kind: "already_credited" };
  }
  if (response.kind !== "ok") {
    return null;
  }
  const body = saleVoidCreditNoteResponseSchema.safeParse(response.body);
  if (!body.success) {
    return null;
  }
  switch (body.data.state) {
    case "AUTHORIZED":
      return {
        kind: "authorized",
        pointOfSale: body.data.point_of_sale,
        number: body.data.number,
        issuedOn: body.data.issued_on,
        issuedAt: new Date(body.data.issued_at),
        authorizationCode: body.data.authorization_code,
        authorizationCodeDueOn: body.data.authorization_code_due_on,
      };
    case "REJECTED":
      return { kind: "rejected" };
    case "IN_PROGRESS":
      return { kind: "in_progress" };
    case "REGULARIZATION_REQUIRED":
      return { kind: "regularization_required" };
  }
}

export class CloudCreditNotes implements CloudCreditNotesPort {
  private readonly deps: CloudCreditNotesDeps;

  constructor(deps: CloudCreditNotesDeps) {
    this.deps = deps;
  }

  async request({
    creditNoteId,
    pointOfSale,
    saleEvent,
    invoice,
  }: CloudCreditNoteCall): Promise<CloudCreditNoteAnswer | null> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return null;
    }
    const body: SaleVoidCreditNoteRequestBody = {
      credit_note_id: creditNoteId,
      point_of_sale: pointOfSale,
      sale_event: saleEvent,
      ...(invoice === undefined
        ? {}
        : {
            invoice: {
              corrects: {
                voucher_type: FACTURA_C_VOUCHER_TYPE,
                point_of_sale: invoice.voucher.pointOfSale,
                number: invoice.voucher.number,
              },
              receiver_tax_status_code: invoice.buyerTaxStatusCode,
            },
          }),
    };
    const response = await this.deps.post("/api/fiscal/credit-notes", deviceToken, body, {
      timeoutMs: this.deps.timeoutMs,
      singleAttempt: true,
    });
    return answerOf(response);
  }
}
