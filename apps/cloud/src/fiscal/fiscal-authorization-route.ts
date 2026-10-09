import {
  cloudError,
  cloudErrorStatus,
  type RealTimeAuthorizationResponseBody,
  realTimeAuthorizationRequestSchema,
  realTimeAuthorizationResponseSchema,
} from "@purosur/contracts";
import {
  authorizeFiscalDocument,
  type RealTimeAuthorizationAnswer,
  type TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { sendRateLimited } from "../platform/rate-limited-response.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import { DrizzlePointOfSaleLanes } from "./drizzle-point-of-sale-lanes.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export type FiscalAuthorizationRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    connections: DedicatedConnections<TQueryResult>;
    taxAuthority: TaxAuthorityInvoicing;
    certificateFingerprint: string;
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

function toWire(answer: RealTimeAuthorizationAnswer): RealTimeAuthorizationResponseBody {
  switch (answer.kind) {
    case "authorized":
      return {
        state: "AUTHORIZED",
        authorization_code: answer.authorizationCode,
        authorization_code_due_on: answer.authorizationCodeDueOn,
      };
    case "rejected":
      return { state: "REJECTED", rejection_codes: [...answer.codes] };
    case "not_attempted":
      return { state: "NOT_ATTEMPTED" };
    case "unclear":
      return { state: "UNCLEAR" };
  }
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerFiscalAuthorizationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalAuthorizationRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const clock = { now: options.now };
  const ports = {
    lanes: new DrizzlePointOfSaleLanes(options.connections),
    clock,
    tokens: new DrizzleWsaaTokenSource(
      options.db,
      clock,
      WSFE_SERVICE,
      options.certificateFingerprint,
    ),
    taxAuthority: options.taxAuthority,
  };

  const admission = { admission: new DrizzleRequestAdmission(options.db), clock };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/fiscal/authorize",
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

        const body = await readValidatedBody(
          reply,
          realTimeAuthorizationRequestSchema,
          request.body,
        );
        if (!body) {
          return;
        }

        const outcome = await authorizeFiscalDocument(ports, {
          registerId: authentication.installation.registerId,
          receivedAt,
          request: {
            fiscalDocumentId: body.fiscal_document_id,
            saleId: body.sale_id,
            pointOfSale: body.point_of_sale,
            number: body.number,
            issuedOn: body.issued_on,
            total: body.total,
            buyerTaxStatusCode: body.buyer_tax_status_code,
            timeoutMs: body.timeout_ms,
            roundTripMedianMs: body.rtt_median_ms,
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
        await reply
          .code(200)
          .send(realTimeAuthorizationResponseSchema.parse(toWire(outcome.answer)));
      },
    );
  });
}
