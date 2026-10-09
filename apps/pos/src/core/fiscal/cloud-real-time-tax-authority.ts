import {
  type RealTimeAuthorizationRequestBody,
  realTimeAuthorizationResponseSchema,
} from "@purosur/contracts";
import type {
  RealTimeAuthorizationAnswer,
  RealTimeAuthorizationCall,
  RealTimeTaxAuthority,
} from "@purosur/domain/fiscal/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudRealTimeTaxAuthorityDeps {
  readDeviceToken: () => Promise<string | undefined>;
  post: (
    path: string,
    bearerToken: string,
    body: unknown,
    options: CloudCallOptions,
  ) => Promise<CloudResponse>;
}

const UNCLEAR: RealTimeAuthorizationAnswer = { kind: "unclear" };
const NOT_ATTEMPTED: RealTimeAuthorizationAnswer = { kind: "not_attempted" };

function answerOf(response: CloudResponse): RealTimeAuthorizationAnswer {
  if (response.kind === "error") {
    return response.error.code === "rate_limited" ? NOT_ATTEMPTED : UNCLEAR;
  }
  if (response.kind === "unreachable") {
    return UNCLEAR;
  }
  const body = realTimeAuthorizationResponseSchema.safeParse(response.body);
  if (!body.success) {
    return UNCLEAR;
  }
  switch (body.data.state) {
    case "AUTHORIZED":
      return {
        kind: "authorized",
        authorizationCode: body.data.authorization_code,
        authorizationCodeDueOn: body.data.authorization_code_due_on,
      };
    case "REJECTED":
      return {
        kind: "rejected",
        codes: body.data.rejection_codes,
        rejectionClass: body.data.rejection_class,
      };
    case "NOT_ATTEMPTED":
      return NOT_ATTEMPTED;
    case "UNCLEAR":
      return UNCLEAR;
  }
}

export class CloudRealTimeTaxAuthority implements RealTimeTaxAuthority {
  private readonly deps: CloudRealTimeTaxAuthorityDeps;

  constructor(deps: CloudRealTimeTaxAuthorityDeps) {
    this.deps = deps;
  }

  async authorize(call: RealTimeAuthorizationCall): Promise<RealTimeAuthorizationAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return NOT_ATTEMPTED;
    }
    const body: RealTimeAuthorizationRequestBody = {
      fiscal_document_id: call.fiscalDocumentId,
      sale_id: call.saleId,
      point_of_sale: call.pointOfSale,
      number: call.number,
      issued_on: call.issuedOn,
      total: call.document.total,
      buyer_tax_status_code: call.document.buyerTaxStatusCode,
      timeout_ms: call.timeoutMs,
      rtt_median_ms: call.roundTripMedianMs,
      sale_event: call.saleEvent,
    };
    const response = await this.deps.post("/api/fiscal/authorize", deviceToken, body, {
      timeoutMs: call.timeoutMs,
      singleAttempt: true,
    });
    return answerOf(response);
  }
}
