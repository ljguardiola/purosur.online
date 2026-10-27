import {
  cloudError,
  cloudErrorStatus,
  contingencyTicketRecoveryAnswerSchema,
  contingencyTicketRecoveryRequestSchema,
} from "@purosur/contracts";
import { askContingencyTicketRecovery } from "@purosur/domain/backups/use-cases";
import { admitRestoredRegisterReplenishment } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { DrizzleRestoredRegisterPredecessors } from "../register/drizzle-restored-register-predecessors.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { DrizzleContingencyTicketRecoveries } from "./drizzle-contingency-ticket-recoveries.js";

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

export function registerContingencyTicketRecoveryRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const admission = { predecessors: new DrizzleRestoredRegisterPredecessors(options.db) };
  const ports = {
    recoveries: new DrizzleContingencyTicketRecoveries(options.db),
    clock: { now: options.now },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/contingency-ticket-recovery",
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
        const body = await readValidatedBody(
          reply,
          contingencyTicketRecoveryRequestSchema,
          request.body,
        );
        if (!body) {
          return;
        }

        const { registerId, deviceId } = authentication.installation;
        const admitted = await admitRestoredRegisterReplenishment(admission, {
          registerId,
          predecessorDeviceId: body.predecessor_device_id,
        });
        switch (admitted.kind) {
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
          case "cursor_not_of_replenishment":
          case "admitted":
            break;
        }

        const standing = await askContingencyTicketRecovery(ports, {
          registerId,
          restoredDeviceId: deviceId,
        });
        await reply
          .code(200)
          .send(contingencyTicketRecoveryAnswerSchema.parse({ status: standing.kind }));
      },
    );
  });
}
