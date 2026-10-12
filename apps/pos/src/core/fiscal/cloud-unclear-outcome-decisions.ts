import { type UnclearOutcomeQuestionBody, unclearOutcomeAnswerSchema } from "@purosur/contracts";
import type {
  UnclearOutcomeAnswer,
  UnclearOutcomeCloud,
  UnclearOutcomeQuestion,
} from "@purosur/domain/fiscal/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudUnclearOutcomeDecisionsDeps {
  readDeviceToken: () => Promise<string | undefined>;
  post: (
    path: string,
    bearerToken: string,
    body: unknown,
    options: CloudCallOptions,
  ) => Promise<CloudResponse>;
}

const NO_ANSWER: UnclearOutcomeAnswer = { kind: "no_answer" };

const UNCLEAR_OUTCOME_CALL_TIMEOUT_MS = 15_000;

function answerOf(response: CloudResponse): UnclearOutcomeAnswer {
  if (response.kind !== "ok") {
    return NO_ANSWER;
  }
  const body = unclearOutcomeAnswerSchema.safeParse(response.body);
  if (!body.success) {
    return NO_ANSWER;
  }
  switch (body.data.state) {
    case "PENDING":
      return { kind: "pending" };
    case "RELEASED":
      return { kind: "decided", decision: { kind: "released" } };
    case "CONFLICTING":
      return { kind: "decided", decision: { kind: "conflicting" } };
    case "ADOPTED":
      return {
        kind: "decided",
        decision: {
          kind: "adopted",
          authorizationCode: body.data.authorization_code,
          authorizationCodeDueOn: body.data.authorization_code_due_on,
        },
      };
    case "AUTHORIZED":
      return {
        kind: "answered",
        answer: {
          kind: "authorized",
          authorizationCode: body.data.authorization_code,
          authorizationCodeDueOn: body.data.authorization_code_due_on,
        },
      };
    case "REJECTED":
      return {
        kind: "answered",
        answer: {
          kind: "rejected",
          codes: body.data.rejection_codes,
          rejectionClass: body.data.rejection_class,
        },
      };
  }
}

export class CloudUnclearOutcomeDecisions implements UnclearOutcomeCloud {
  private readonly deps: CloudUnclearOutcomeDecisionsDeps;

  constructor(deps: CloudUnclearOutcomeDecisionsDeps) {
    this.deps = deps;
  }

  async outcomeOf(question: UnclearOutcomeQuestion): Promise<UnclearOutcomeAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return NO_ANSWER;
    }
    const body: UnclearOutcomeQuestionBody = {
      fiscal_document_id: question.fiscalDocumentId,
      sale_id: question.saleId,
      point_of_sale: question.pointOfSale,
      number: question.number,
      issued_on: question.issuedOn,
      total: question.document.total,
      buyer_tax_status_code: question.document.buyerTaxStatusCode,
      sale_event: question.saleEvent,
    };
    const response = await this.deps.post("/api/fiscal/unclear-outcomes", deviceToken, body, {
      timeoutMs: UNCLEAR_OUTCOME_CALL_TIMEOUT_MS,
      singleAttempt: true,
    });
    return answerOf(response);
  }
}
