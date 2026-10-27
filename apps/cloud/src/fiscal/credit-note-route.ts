import {
  cloudError,
  cloudErrorStatus,
  type SaleVoidCreditNoteResponseBody,
  saleReturnedEventCreditNoteSchema,
  saleVoidCreditNoteRequestSchema,
  saleVoidCreditNoteResponseSchema,
  saleVoidedEventCreditNoteSchema,
} from "@purosur/contracts";
import type { InvoicedCreditNote } from "@purosur/domain";
import {
  type AcceptSaleCreditNoteRequestOutcome,
  acceptSaleCreditNoteRequest,
  creditNoteAnswerOf,
  issueCreditNote,
} from "@purosur/domain/fiscal/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { reportError } from "../platform/error-reporting.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleInbox } from "../sync/drizzle-inbox.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import {
  type EnqueueEventApplication,
  enqueueEventApplicationJob,
} from "../sync/graphile-event-application-queue.js";
import { hmacEventChain } from "../sync/hmac-event-chain.js";
import { InboxAttachedSaleEvents } from "../sync/inbox-attached-sale-events.js";
import { type CreditNoteInput, creditNoteIssuancePorts } from "./credit-note-task.js";
import { DrizzleSaleCreditNoteLanes } from "./drizzle-sale-credit-notes.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";

export type CreditNoteRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> &
    CreditNoteInput<TQueryResult> & {
      enqueueCreditNote: EnqueueCreditNote;
      enqueueEventApplication?: EnqueueEventApplication;
      report?: typeof reportError;
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
  "sale_event must be the voiding or the return of the sale that asks for credit_note_id",
);

const INVOICE_MISSING = cloudError(
  "validation_failed",
  "invoice must name the invoice a credit note that waited for it corrects",
);

type RequestBody = ReturnType<typeof saleVoidCreditNoteRequestSchema.parse>;

function creditNoteAsked(body: RequestBody): InvoicedCreditNote | null | "invoice_missing" {
  const voided = saleVoidedEventCreditNoteSchema.safeParse(body.sale_event);
  if (voided.success) {
    const { aggregate_id: saleId, payload } = voided.data;
    const { corrects } = payload.credit_note;
    return {
      creditNoteId: payload.credit_note.id,
      saleId,
      total: payload.credit_note.total,
      receiverTaxStatusCode: payload.credit_note.receiver_tax_status_code,
      correctedVoucher: {
        voucherType: corrects.voucher_type,
        pointOfSale: corrects.point_of_sale,
        number: corrects.number,
      },
      origin: { kind: "sale_void" },
    };
  }
  const returned = saleReturnedEventCreditNoteSchema.safeParse(body.sale_event);
  if (!returned.success) {
    return null;
  }
  const { payload } = returned.data;
  const { credit_note: creditNote } = payload;
  const corrects = creditNote.corrects ?? body.invoice?.corrects;
  const receiverTaxStatusCode =
    creditNote.receiver_tax_status_code ?? body.invoice?.receiver_tax_status_code;
  if (corrects === undefined || receiverTaxStatusCode === undefined) {
    return "invoice_missing";
  }
  return {
    creditNoteId: creditNote.id,
    saleId: payload.sale_id,
    total: creditNote.total,
    receiverTaxStatusCode,
    correctedVoucher: {
      voucherType: corrects.voucher_type,
      pointOfSale: corrects.point_of_sale,
      number: corrects.number,
    },
    origin: { kind: "sale_return", returnId: payload.id, issuedOn: creditNote.issued_on },
  };
}

function refusalOf(
  outcome: AcceptSaleCreditNoteRequestOutcome,
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
    case "invoice_not_yet_known":
      return null;
  }
}

type CreditNoteAnswer = NonNullable<ReturnType<typeof creditNoteAnswerOf>>;

const IN_PROGRESS: CreditNoteAnswer = { kind: "in_progress" };

function toWire(answer: CreditNoteAnswer): SaleVoidCreditNoteResponseBody {
  switch (answer.kind) {
    case "authorized":
      return {
        state: "AUTHORIZED",
        point_of_sale: answer.pointOfSale,
        number: answer.number,
        issued_on: answer.issuedOn,
        issued_at: answer.issuedAt.toISOString(),
        authorization_code: answer.authorizationCode,
        authorization_code_due_on: answer.authorizationCodeDueOn,
      };
    case "rejected":
      return { state: "REJECTED" };
    case "regularization_required":
      return { state: "REGULARIZATION_REQUIRED" };
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
    lanes: new DrizzleSaleCreditNoteLanes(options.connections, options.enqueueCreditNote),
    attachedSaleEvents: new InboxAttachedSaleEvents(
      {
        inbox: new DrizzleInbox(
          options.db,
          installationKeyCipher(options.keysEncryptionKey),
          options.enqueueEventApplication ?? enqueueEventApplicationJob,
        ),
        eventChain: hmacEventChain,
        clock: { now: options.now },
      },
      options.report ?? reportError,
    ),
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

        const asked = creditNoteAsked(body);
        if (asked === null || asked === "invoice_missing") {
          const refused = asked === null ? SALE_EVENT_MISMATCH : INVOICE_MISSING;
          await reply.code(cloudErrorStatus(refused.code)).send(refused);
          return;
        }

        const outcome = await acceptSaleCreditNoteRequest(requestPorts, {
          deviceId: authentication.installation.deviceId,
          registerId: authentication.installation.registerId,
          receivedAt,
          request: {
            creditNoteId: body.credit_note_id,
            pointOfSale: body.point_of_sale,
            saleEvent: body.sale_event,
            creditNote: asked,
          },
        });

        const refusal = refusalOf(outcome);
        if (refusal !== null) {
          await reply.code(cloudErrorStatus(refusal.code)).send(refusal);
          return;
        }

        if (outcome.kind === "invoice_not_yet_known") {
          await reply.code(200).send(saleVoidCreditNoteResponseSchema.parse(toWire(IN_PROGRESS)));
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
