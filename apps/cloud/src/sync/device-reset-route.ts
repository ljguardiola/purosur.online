import {
  cloudError,
  cloudErrorStatus,
  registerResetRequestSchema,
  registerResetResponseSchema,
} from "@purosur/contracts";
import { serveRestoredRegisterReplenishment } from "@purosur/domain/sync/use-cases";
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
import { DrizzleRegisterReplenishment } from "./drizzle-register-replenishment.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const PREDECESSOR_NOT_OF_REGISTER = cloudError(
  "predecessor_not_of_register",
  "the predecessor installation does not belong to this register",
);
const PREDECESSOR_NOT_REVOKED = cloudError(
  "predecessor_not_revoked",
  "the predecessor installation is not revoked",
);

export function registerDeviceResetRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = { replenishment: new DrizzleRegisterReplenishment(options.db) };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/reset",
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
        const body = await readValidatedBody(reply, registerResetRequestSchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await serveRestoredRegisterReplenishment(ports, {
          registerId: authentication.installation.registerId,
          predecessorDeviceId: body.predecessor_device_id,
          lastAcknowledgedSeq: body.last_acknowledged_seq,
          ...(body.after && {
            after: { deviceId: body.after.device_id, deviceSeq: body.after.device_seq },
          }),
        });

        switch (outcome.kind) {
          case "predecessor_not_of_register":
            await reply
              .code(cloudErrorStatus(PREDECESSOR_NOT_OF_REGISTER.code))
              .send(PREDECESSOR_NOT_OF_REGISTER);
            return;
          case "predecessor_not_revoked":
            await reply
              .code(cloudErrorStatus(PREDECESSOR_NOT_REVOKED.code))
              .send(PREDECESSOR_NOT_REVOKED);
            return;
          case "replenishment":
            await reply.code(200).send(
              registerResetResponseSchema.parse({
                events: outcome.events.map(({ event }) => event),
                next: outcome.next && {
                  device_id: outcome.next.deviceId,
                  device_seq: outcome.next.deviceSeq,
                },
                users: outcome.users.map((user) => ({
                  user_id: user.userId,
                  first_name: user.firstName,
                  role_id: user.roleId,
                  salt: user.salt,
                  pin_hash: user.pinHash,
                  active: user.active,
                  version: user.version,
                })),
              }),
            );
            return;
        }
      },
    );
  });
}
