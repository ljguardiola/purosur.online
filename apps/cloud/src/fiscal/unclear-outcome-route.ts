import {
  cloudError,
  cloudErrorStatus,
  type UnclearOutcomeAnswerBody,
  unclearOutcomeAnswerSchema,
  unclearOutcomeQuestionSchema,
} from "@purosur/contracts";
import {
  type AskAboutUnclearOutcomeOutcome,
  askAboutUnclearOutcome,
} from "@purosur/domain/fiscal/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
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
import { DrizzleUnclearOutcomeLanes } from "./drizzle-unclear-outcome-lanes.js";
import type { EnqueueUnclearOutcome } from "./enqueue-unclear-outcome.js";

export type UnclearOutcomeRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    connections: DedicatedConnections<TQueryResult>;
    enqueueUnclearOutcome: EnqueueUnclearOutcome;
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

const FISCAL_DOCUMENT_NOT_OWNED = cloudError(
  "not_found",
  "that fiscal document is not this register's",
);

const SALE_EVENT_MISMATCH = cloudError(
  "validation_failed",
  "sale_event must be the completion of sale_id",
);

type AnsweredOutcome = Extract<AskAboutUnclearOutcomeOutcome, { kind: "pending" | "decided" }>;

function toWire(outcome: AnsweredOutcome): UnclearOutcomeAnswerBody {
  if (outcome.kind === "pending") {
    return { state: "PENDING" };
  }
  const { decision } = outcome;
  switch (decision.kind) {
    case "released":
      return { state: "RELEASED" };
    case "adopted":
      return {
        state: "ADOPTED",
        authorization_code: decision.authorizationCode,
        authorization_code_due_on: decision.authorizationCodeDueOn,
      };
    case "conflicting":
      return { state: "CONFLICTING" };
  }
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerUnclearOutcomeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UnclearOutcomeRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const clock = { now: options.now };
  const ports = {
    lanes: new DrizzleUnclearOutcomeLanes(options.connections, options.enqueueUnclearOutcome),
    clock,
  };
  const admission = { admission: new DrizzleRequestAdmission(options.db), clock };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/fiscal/unclear-outcomes",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
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
          endpoint: "fiscal_unclear_outcome",
        });
        if (admitted.kind === "rate_limited") {
          await sendRateLimited(reply, "too many requests", admitted.retryAfterSeconds);
          return;
        }

        const body = await readValidatedBody(reply, unclearOutcomeQuestionSchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await askAboutUnclearOutcome(ports, {
          registerId: authentication.installation.registerId,
          request: {
            fiscalDocumentId: body.fiscal_document_id,
            saleId: body.sale_id,
            pointOfSale: body.point_of_sale,
            number: body.number,
            issuedOn: body.issued_on,
            total: body.total,
            buyerTaxStatusCode: body.buyer_tax_status_code,
            saleEvent: body.sale_event,
          },
        });

        if (outcome.kind === "point_of_sale_not_owned") {
          await reply
            .code(cloudErrorStatus(POINT_OF_SALE_NOT_OWNED.code))
            .send(POINT_OF_SALE_NOT_OWNED);
          return;
        }
        if (outcome.kind === "fiscal_document_not_owned") {
          await reply
            .code(cloudErrorStatus(FISCAL_DOCUMENT_NOT_OWNED.code))
            .send(FISCAL_DOCUMENT_NOT_OWNED);
          return;
        }
        if (outcome.kind === "sale_event_mismatch") {
          await reply.code(cloudErrorStatus(SALE_EVENT_MISMATCH.code)).send(SALE_EVENT_MISMATCH);
          return;
        }
        await reply.code(200).send(unclearOutcomeAnswerSchema.parse(toWire(outcome)));
      },
    );
  });
}
