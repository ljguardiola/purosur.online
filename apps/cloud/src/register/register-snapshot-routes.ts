import {
  cloudError,
  cloudErrorStatus,
  restorableSnapshotsSchema,
  snapshotCorruptionBodySchema,
  snapshotUploadAnswerSchema,
  snapshotUploadBodySchema,
} from "@purosur/contracts";
import {
  listRestorableSnapshotGenerations,
  recordSnapshotUploaded,
  reportSnapshotCorruption,
  requestSnapshotUpload,
  type SnapshotUploads,
  SnapshotUploadWindowClosed,
} from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { authenticateDevice } from "./device-authentication.js";
import { DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";
import { type DeviceTokensOptions, installationTokenPorts } from "./installation-token-ports.js";

export interface RegisterSnapshotUrls extends SnapshotUploads {
  downloadUrl(registerId: string, generationId: string): Promise<string>;
}

export type RegisterSnapshotRoutesOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    urls?: RegisterSnapshotUrls;
    reportError?: (error: unknown) => void;
  };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const SNAPSHOT_BACKUPS_UNAVAILABLE = cloudError(
  "snapshot_backups_unavailable",
  "the register backups are not available right now",
);

class SnapshotBucketUnavailable extends Error {}

function reportingBucketUnavailable(uploads: SnapshotUploads): SnapshotUploads {
  return {
    async authorizeUpload(upload) {
      try {
        return await uploads.authorizeUpload(upload);
      } catch (error) {
        if (error instanceof SnapshotUploadWindowClosed) {
          throw error;
        }
        throw new SnapshotBucketUnavailable("the register snapshots bucket cannot sign", {
          cause: error,
        });
      }
    },
  };
}

interface AuthenticatedRegister {
  registerId: string;
  deviceId: string;
}

// Public to the backoffice's session guard: the device token is these routes' own authentication.
export function registerRegisterSnapshotRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterSnapshotRoutesOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const store = new DrizzleSnapshotStore(options.db);
  const clock = { now: options.now };

  async function authenticated(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthenticatedRegister | undefined> {
    const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
    if (authentication.kind !== "installation" || authentication.installation.revoked) {
      await reply
        .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
        .header("WWW-Authenticate", "Bearer")
        .send(DEVICE_TOKEN_REJECTED);
      return undefined;
    }
    return authentication.installation;
  }

  async function unavailable(reply: FastifyReply, error?: unknown): Promise<void> {
    if (error !== undefined) {
      options.reportError?.(error);
    }
    await reply
      .code(cloudErrorStatus(SNAPSHOT_BACKUPS_UNAVAILABLE.code))
      .send(SNAPSHOT_BACKUPS_UNAVAILABLE);
  }

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/snapshots",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const register = await authenticated(request, reply);
        if (!register) {
          return;
        }
        const body = await readValidatedBody(reply, snapshotUploadBodySchema, request.body);
        if (!body) {
          return;
        }
        const { urls } = options;
        if (!urls) {
          await unavailable(reply);
          return;
        }

        let outcome: Awaited<ReturnType<typeof requestSnapshotUpload>>;
        try {
          outcome = await requestSnapshotUpload(
            { store, uploads: reportingBucketUnavailable(urls), clock },
            {
              registerId: register.registerId,
              deviceId: register.deviceId,
              generationId: body.generation_id,
              size: body.size,
              sha256: body.sha256,
              keyVersion: body.key_version,
            },
          );
        } catch (error) {
          if (error instanceof SnapshotBucketUnavailable) {
            await unavailable(reply, error.cause);
            return;
          }
          throw error;
        }
        if (outcome.kind === "unknown_key_version") {
          await reply
            .code(cloudErrorStatus("validation_failed"))
            .send(
              cloudError("validation_failed", "the register holds no such snapshot key version", [
                { field: "key_version" },
              ]),
            );
          return;
        }
        if (outcome.kind !== "authorized") {
          await reply
            .code(cloudErrorStatus("conflict"))
            .send(
              cloudError("conflict", "the snapshot generation was declared differently before"),
            );
          return;
        }
        const { authorization } = outcome;
        await reply.code(200).send(
          snapshotUploadAnswerSchema.parse({
            upload_url: authorization.url,
            required_headers: authorization.requiredHeaders,
            expires_at: authorization.expiresAt.toISOString(),
            current_key_version: outcome.currentKeyVersion,
          }),
        );
      },
    );

    scope.post(
      "/devices/current/snapshots/:generationId/uploaded",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const register = await authenticated(request, reply);
        if (!register) {
          return;
        }
        const ids = await readRecordIds(reply, request.params, ["generationId"]);
        if (!ids) {
          return;
        }
        if (!options.urls) {
          await unavailable(reply);
          return;
        }

        const outcome = await recordSnapshotUploaded(
          { store, clock },
          { registerId: register.registerId, generationId: ids.generationId },
        );
        if (outcome.kind === "generation_unknown") {
          await reply
            .code(cloudErrorStatus("not_found"))
            .send(cloudError("not_found", "no such snapshot generation"));
          return;
        }
        await reply.code(204).send();
      },
    );

    scope.post(
      "/devices/current/snapshot-corruption",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const register = await authenticated(request, reply);
        if (!register) {
          return;
        }
        const body = await readValidatedBody(reply, snapshotCorruptionBodySchema, request.body);
        if (!body) {
          return;
        }
        if (!options.urls) {
          await unavailable(reply);
          return;
        }

        await reportSnapshotCorruption(
          { store, clock },
          { registerId: register.registerId, stage: body.stage },
        );
        await reply.code(204).send();
      },
    );

    scope.get(
      "/devices/current/snapshots",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const register = await authenticated(request, reply);
        if (!register) {
          return;
        }
        const { urls } = options;
        if (!urls) {
          await unavailable(reply);
          return;
        }

        try {
          const generations = await listRestorableSnapshotGenerations(
            { store },
            { registerId: register.registerId },
          );
          const answer = restorableSnapshotsSchema.parse({
            generations: await Promise.all(
              generations.map(async (generation) => ({
                generation_id: generation.generationId,
                created_at: generation.createdAt.toISOString(),
                size: generation.size,
                sha256: generation.sha256,
                key_version: generation.keyVersion,
                download_url: await urls.downloadUrl(
                  generation.registerId,
                  generation.generationId,
                ),
              })),
            ),
          });
          await reply.code(200).send(answer);
        } catch (error) {
          await unavailable(reply, error);
        }
      },
    );
  });
}
