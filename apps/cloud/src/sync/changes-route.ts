import {
  type ChangesPage,
  changesPageSchema,
  changesQuerySchema,
  cloudError,
  cloudErrorStatus,
} from "@purosur/contracts";
import { type PullPage, pullChanges } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { toBranchSettingsWire } from "../branch/branch-settings-read-route.js";
import { registerInstallations, registers } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { DrizzleChangeLog, type PulledBranchSettingsChange } from "./drizzle-change-log.js";

export type ChangesRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult>;

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

function toChangesPageWire(page: PullPage<PulledBranchSettingsChange>): ChangesPage {
  return {
    changes: page.changes.map((change) => ({
      change_seq: change.changeSeq,
      entity: change.entity,
      entity_id: change.entityId,
      row: toBranchSettingsWire(change.row),
    })),
    cursor: page.cursor,
    has_more: page.hasMore,
  };
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerChangesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ChangesRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    changeLog: new DrizzleChangeLog(options.db),
    clock: { now: options.now ?? (() => new Date()) },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get("/changes", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
      if (authentication.kind !== "installation" || authentication.installation.revoked) {
        await reply
          .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
          .header("WWW-Authenticate", "Bearer")
          .send(DEVICE_TOKEN_REJECTED);
        return;
      }

      const query = await readValidatedBody(reply, changesQuerySchema, request.query);
      if (!query) {
        return;
      }

      const { deviceId } = authentication.installation;
      const [installation] = await options.db
        .select({ locationId: registers.locationId })
        .from(registerInstallations)
        .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
        .where(eq(registerInstallations.id, deviceId));
      if (!installation) {
        throw new Error("an authenticated installation has no register");
      }

      const page = await pullChanges(ports, {
        deviceId,
        locationId: installation.locationId,
        since: query.since,
      });
      await reply.code(200).send(changesPageSchema.parse(toChangesPageWire(page)));
    });
  });
}
