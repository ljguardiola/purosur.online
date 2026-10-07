import { cloudError, cloudErrorStatus, healthCheckSchema } from "@purosur/contracts";
import type { ArcaOnlineStatus } from "@purosur/domain/fiscal/use-cases";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import type { DeviceAuthentication } from "../register/device-authentication.js";

export interface HealthRouteOptions {
  version: string;
  arcaOnlineStatus?: () => Promise<ArcaOnlineStatus>;
  authenticateDevice?: (authorization: string | undefined) => Promise<DeviceAuthentication>;
}

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

// The route stays public: the platform's own healthcheck reaches it without any device token.
export function registerHealthRoute(app: FastifyInstance, options: HealthRouteOptions): void {
  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get("/health", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const authentication = (await options.authenticateDevice?.(
        request.headers.authorization,
      )) ?? {
        kind: "anonymous",
      };

      if (authentication.kind === "rejected") {
        await reply
          .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
          .header("WWW-Authenticate", "Bearer")
          .send(DEVICE_TOKEN_REJECTED);
        return;
      }

      const arca =
        authentication.kind === "installation" ? await options.arcaOnlineStatus?.() : undefined;

      await reply.send(
        healthCheckSchema.parse({
          status: "ok",
          version: options.version,
          ...(authentication.kind === "installation" && {
            installation: { revoked: authentication.installation.revoked },
          }),
          ...(arca && {
            arca: {
              token_valid: arca.tokenValid,
              probe_ok_at: arca.probeOkAt?.toISOString() ?? null,
              reachable: arca.reachable,
            },
          }),
        }),
      );
    });
  });
}
