import { cloudError, cloudErrorStatus, snapshotsOnDiskBodySchema } from "@purosur/contracts";
import { recordSnapshotGenerationsOnDisk } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { authenticateDevice } from "./device-authentication.js";
import { DrizzleSnapshotDiskStore } from "./drizzle-snapshot-disk-store.js";
import { type DeviceTokensOptions, installationTokenPorts } from "./installation-token-ports.js";

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerSnapshotOnDiskRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceTokensOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const store = new DrizzleSnapshotDiskStore(options.db);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.put(
      "/devices/current/snapshots/on-disk",
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
        const body = await readValidatedBody(reply, snapshotsOnDiskBodySchema, request.body);
        if (!body) {
          return;
        }

        await recordSnapshotGenerationsOnDisk(
          { store },
          {
            registerId: authentication.installation.registerId,
            generationIds: body.generation_ids,
          },
        );
        await reply.code(204).send();
      },
    );
  });
}
