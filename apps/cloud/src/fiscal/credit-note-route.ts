import {
  cloudError,
  cloudErrorStatus,
  type SaleVoidCreditNoteResponseBody,
  saleVoidCreditNoteRequestSchema,
  saleVoidCreditNoteResponseSchema,
} from "@purosur/contracts";
import { invoiceAlreadyCreditedObservation } from "@purosur/domain";
import {
  creditNoteAnswerOf,
  issueCreditNote,
  type RequestSaleVoidCreditNoteOutcome,
  requestSaleVoidCreditNote,
} from "@purosur/domain/fiscal/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import { type CreditNoteInput, creditNoteIssuancePorts } from "./credit-note-task.js";
import { DrizzleSaleVoidCreditNoteLanes } from "./drizzle-sale-void-credit-notes.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";

export type CreditNoteRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> &
    CreditNoteInput<TQueryResult> & {
      enqueueCreditNote: EnqueueCreditNote;
    };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

const REVOKED = cloudError("revoked", "this installation was revoked");

const POINT_OF_SALE_NOT_OWNED = cloudError(
  "not_found",
  "that point of sale is not this register's",
);

const CREDIT_NOTE_NOT_OWNED = cloudError("not_found", "that credit note is not this register's");

const VOUCHER_NOT_OWNED = cloudError(
  "not_found",
  "the invoice to correct was not issued from this register's points of sale",
);

const VOUCHER_ALREADY_CREDITED = cloudError("conflict", "that invoice already has a credit note");

const SALE_EVENT_MISMATCH = cloudError(
  "validation_failed",
  "sale_event must be the voiding of the sale that asks for credit_note_id",
);

function refusalOf(
  outcome: RequestSaleVoidCreditNoteOutcome,
): ReturnType<typeof cloudError> | null {
  switch (outcome.kind) {
    case "sale_event_mismatch":
      return SALE_EVENT_MISMATCH;
    case "point_of_sale_not_owned":
      return POINT_OF_SALE_NOT_OWNED;
    case "credit_note_not_owned":
      return CREDIT_NOTE_NOT_OWNED;
    case "voucher_not_owned":
      return VOUCHER_NOT_OWNED;
    case "voucher_already_credited":
      return VOUCHER_ALREADY_CREDITED;
    case "recorded":
    case "already_recorded":
      return null;
  }
}

type CreditNoteAnswer = NonNullable<ReturnType<typeof creditNoteAnswerOf>>;

function toWire(answer: CreditNoteAnswer): SaleVoidCreditNoteResponseBody {
  switch (answer.kind) {
    case "authorized":
      return {
        state: "AUTHORIZED",
        point_of_sale: answer.pointOfSale,
        number: answer.number,
        issued_on: answer.issuedOn,
        authorization_code: answer.authorizationCode,
        authorization_code_due_on: answer.authorizationCodeDueOn,
      };
    case "rejected":
      return { state: "REJECTED" };
    case "in_progress":
      return { state: "IN_PROGRESS" };
  }
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerCreditNoteRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CreditNoteRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const requestPorts = {
    lanes: new DrizzleSaleVoidCreditNoteLanes(options.connections, options.enqueueCreditNote),
  };
  const issuancePorts = creditNoteIssuancePorts(options);
  const admission = {
    admission: new DrizzleRequestAdmission(options.db),
    clock: { now: options.now },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/fiscal/credit-notes",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const receivedAt = options.now();
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation") {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }
        if (authentication.installation.revoked) {
          await reply.code(cloudErrorStatus(REVOKED.code)).send(REVOKED);
          return;
        }

        const admitted = await admitInstallationRequest(admission, {
          deviceId: authentication.installation.deviceId,
          endpoint: "fiscal_authorize",
        });
        if (admitted.kind === "rate_limited") {
          await sendRateLimited(reply, "too many requests", admitted.retryAfterSeconds);
          return;
        }

        const body = await readValidatedBody(reply, saleVoidCreditNoteRequestSchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await requestSaleVoidCreditNote(requestPorts, {
          registerId: authentication.installation.registerId,
          receivedAt,
          request: {
            creditNoteId: body.credit_note_id,
            pointOfSale: body.point_of_sale,
            saleEvent: body.sale_event,
          },
        });

        const refusal = refusalOf(outcome);
        if (outcome.kind === "voucher_already_credited") {
          const observation = invoiceAlreadyCreditedObservation({
            pointOfSale: outcome.voucher.pointOfSale,
            number: outcome.voucher.number,
            saleId: outcome.saleId,
          });
          if (observation.holds) {
            await openAlert(options.db, observation.alert, { now: () => receivedAt });
          }
        }
        if (refusal !== null) {
          await reply.code(cloudErrorStatus(refusal.code)).send(refusal);
          return;
        }

        const recordedAnswer =
          outcome.kind === "already_recorded" && outcome.answer.kind !== "in_progress"
            ? outcome.answer
            : null;
        const answer =
          recordedAnswer ??
          creditNoteAnswerOf(
            await issueCreditNote(issuancePorts, { creditNoteId: body.credit_note_id }),
          );
        if (answer === null) {
          throw new Error(`the credit note ${body.credit_note_id} vanished after it was recorded`);
        }
        await reply.code(200).send(saleVoidCreditNoteResponseSchema.parse(toWire(answer)));
      },
    );
  });
}
