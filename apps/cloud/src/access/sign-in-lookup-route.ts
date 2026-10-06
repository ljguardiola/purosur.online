import {
  cloudError,
  cloudErrorStatus,
  signInLookupBodySchema,
  signInLookupSchema,
} from "@purosur/contracts";
import { lookUpSignIn } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { DrizzleSignInLookupStore } from "./drizzle-sign-in-lookup-store.js";
import { PUBLIC_ACCESS } from "./route-access.js";

export type SignInLookupRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult>;

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerSignInLookupRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SignInLookupRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    store: new DrizzleSignInLookupStore(options.db),
    clock: { now: options.now },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/sign-in-lookups",
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

        const body = await readValidatedBody(reply, signInLookupBodySchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await lookUpSignIn(ports, {
          registerId: authentication.installation.registerId,
          email: body.email,
        });

        switch (outcome.kind) {
          case "rate_limited":
            await reply
              .code(cloudErrorStatus("rate_limited"))
              .header("Retry-After", String(outcome.retryAfterSeconds))
              .send(
                cloudError("rate_limited", "too many sign-in lookups", [
                  { retry_after_seconds: outcome.retryAfterSeconds },
                ]),
              );
            return;
          case "not_found":
            await reply.code(200).send(signInLookupSchema.parse({ kind: "not_found" }));
            return;
          case "found":
            await reply.code(200).send(
              signInLookupSchema.parse({
                kind: "found",
                user_id: outcome.userId,
                has_pin: outcome.hasPin,
              }),
            );
            return;
        }
      },
    );
  });
}
