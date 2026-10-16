import {
  cloudError,
  cloudErrorStatus,
  currentSnapshotKeyVersionAnswerSchema,
} from "@purosur/contracts";
import { currentSnapshotKeyVersion } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { authenticateDevice } from "./device-authentication.js";
import { DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";
import { type DeviceTokensOptions, installationTokenPorts } from "./installation-token-ports.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerSnapshotKeyVersionRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const store = new DrizzleSnapshotStore(options.db);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get(
      "/devices/current/snapshot-key-version",
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

        const outcome = await currentSnapshotKeyVersion(
          { store },
          { registerId: authentication.installation.registerId },
        );
        if (outcome.kind === "no_key_yet") {
          await reply
            .code(cloudErrorStatus("not_found"))
            .send(cloudError("not_found", "the register holds no snapshot key yet"));
          return;
        }
        await reply.code(200).send(
          currentSnapshotKeyVersionAnswerSchema.parse({
            current_key_version: outcome.keyVersion,
          }),
        );
      },
    );
  });
}
