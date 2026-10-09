import { cloudError, cloudErrorStatus, deviceTokenRotationSchema } from "@purosur/contracts";
import { rotateDeviceToken } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { readBearerDeviceToken } from "./device-authentication.js";
import { installationKeysBody } from "./installation-keys-body.js";
import { type DeviceTokensOptions, deviceTokenRotationPorts } from "./installation-token-ports.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

export function registerDeviceTokenRotationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const ports = deviceTokenRotationPorts(options);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/tokens",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const { authorization } = request.headers;
        const deviceToken =
          authorization === undefined ? undefined : readBearerDeviceToken(authorization);
        const outcome = deviceToken && (await rotateDeviceToken(ports, { deviceToken }));

        if (!outcome || outcome.kind === "token_rejected") {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }

        await reply.code(200).send(
          deviceTokenRotationSchema.parse({
            device_token: outcome.deviceToken,
            ...installationKeysBody(outcome.keys),
          }),
        );
      },
    );
  });
}
