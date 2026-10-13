import {
  cloudError,
  cloudErrorStatus,
  registerUpdateAnswerSchema,
  registerUpdateQuerySchema,
  registerVersionText,
} from "@purosur/contracts";
import {
  findRegisterUpdate,
  type RegisterRelease,
  type RegisterReleases,
} from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { authenticateDevice } from "./device-authentication.js";
import { type DeviceTokensOptions, installationTokenPorts } from "./installation-token-ports.js";

export interface RegisterUpdateFeed {
  releases: RegisterReleases;
  downloadUrl: (release: RegisterRelease) => Promise<string>;
}

export type RegisterUpdateRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    feed?: RegisterUpdateFeed;
    reportError?: (error: unknown) => void;
  };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const UPDATE_FEED_UNAVAILABLE = cloudError(
  "update_feed_unavailable",
  "the register updates are not available right now",
);

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerRegisterUpdateRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterUpdateRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get("/register/update", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
      if (authentication.kind !== "installation" || authentication.installation.revoked) {
        await reply
          .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
          .header("WWW-Authenticate", "Bearer")
          .send(DEVICE_TOKEN_REJECTED);
        return;
      }

      const query = await readValidatedBody(reply, registerUpdateQuerySchema, request.query);
      if (!query) {
        return;
      }

      const { feed } = options;
      try {
        if (!feed) {
          throw new Error("the register updates bucket is not configured");
        }
        const outcome = await findRegisterUpdate(
          { releases: feed.releases },
          { installedVersion: query.installed_version },
        );
        if (outcome.kind === "up_to_date") {
          await reply.code(200).send(registerUpdateAnswerSchema.parse({ status: "up_to_date" }));
          return;
        }
        const { release } = outcome;
        const answer = registerUpdateAnswerSchema.parse({
          status: "available",
          version: registerVersionText(release.version),
          size: release.size,
          sha512: release.sha512,
          download_url: await feed.downloadUrl(release),
        });
        await reply.code(200).send(answer);
      } catch (error) {
        options.reportError?.(error);
        await reply
          .code(cloudErrorStatus(UPDATE_FEED_UNAVAILABLE.code))
          .send(UPDATE_FEED_UNAVAILABLE);
      }
    });
  });
}
