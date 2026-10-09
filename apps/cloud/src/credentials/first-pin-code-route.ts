import {
  cloudError,
  cloudErrorStatus,
  firstPinCodeBodySchema,
  firstPinCodeSchema,
} from "@purosur/contracts";
import { emitFirstPinCode } from "@purosur/domain/credentials/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleFirstPinCodeStore } from "./drizzle-first-pin-code-store.js";
import type { EnqueueFirstPinCodeEmail } from "./graphile-first-pin-code-email-queue.js";
import { generatePinCode } from "./pin-code-generator.js";

export interface FirstPinCodeRouteOptions<TQueryResult extends PgQueryResultHKT>
  extends DeviceTokensOptions<TQueryResult> {
  enqueueEmail?: EnqueueFirstPinCodeEmail;
}

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const NOT_FOUND = cloudError("not_found", "no active user with that id at this location");
const PIN_ALREADY_SET = cloudError("pin_already_set", "the user already has a PIN");

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerFirstPinCodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FirstPinCodeRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    store: new DrizzleFirstPinCodeStore(options.db, options.now, options.enqueueEmail),
    clock: { now: options.now },
    codes: { generate: generatePinCode },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/first-pin-codes",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation" || authentication.installation.revoked) {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }

        const body = await readValidatedBody(reply, firstPinCodeBodySchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await emitFirstPinCode(ports, {
          registerId: authentication.installation.registerId,
          userId: body.user_id,
        });

        switch (outcome.kind) {
          case "not_found":
            await reply.code(cloudErrorStatus(NOT_FOUND.code)).send(NOT_FOUND);
            return;
          case "pin_already_set":
            await reply.code(cloudErrorStatus(PIN_ALREADY_SET.code)).send(PIN_ALREADY_SET);
            return;
          case "rate_limited":
            await reply
              .code(cloudErrorStatus("rate_limited"))
              .header("Retry-After", String(outcome.retryAfterSeconds))
              .send(
                cloudError("rate_limited", "too many first PIN codes requested", [
                  { retry_after_seconds: outcome.retryAfterSeconds },
                ]),
              );
            return;
          case "emitted":
            await reply
              .code(201)
              .send(firstPinCodeSchema.parse({ expires_at: outcome.expiresAt.toISOString() }));
            return;
        }
      },
    );
  });
}
