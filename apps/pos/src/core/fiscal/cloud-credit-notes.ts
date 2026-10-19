import {
  type SaleVoidCreditNoteRequestBody,
  saleVoidCreditNoteResponseSchema,
} from "@purosur/contracts";
import type { CreditNoteAnswer } from "@purosur/domain";
import type {
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

function answerOf(response: CloudResponse): CreditNoteAnswer | null {
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
        authorizationCode: body.data.authorization_code,
        authorizationCodeDueOn: body.data.authorization_code_due_on,
      };
    case "REJECTED":
      return { kind: "rejected" };
    case "IN_PROGRESS":
      return { kind: "in_progress" };
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
  }: CloudCreditNoteCall): Promise<CreditNoteAnswer | null> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return null;
    }
    const body: SaleVoidCreditNoteRequestBody = {
      credit_note_id: creditNoteId,
      point_of_sale: pointOfSale,
      sale_event: saleEvent,
    };
    const response = await this.deps.post("/api/fiscal/credit-notes", deviceToken, body, {
      timeoutMs: this.deps.timeoutMs,
      singleAttempt: true,
    });
    return answerOf(response);
  }
}
