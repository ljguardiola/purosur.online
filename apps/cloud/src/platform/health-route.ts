import { cloudError, cloudErrorStatus, healthCheckSchema } from "@purosur/contracts";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import type { DeviceAuthentication } from "../register/device-authentication.js";

export interface HealthRouteOptions {
  version: string;
  authenticateDevice?: (authorization: string | undefined) => Promise<DeviceAuthentication>;
}

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

// The route stays public: the platform's own healthcheck reaches it without any device token.
export function registerHealthRoute(app: FastifyInstance, options: HealthRouteOptions): void {
  app.get("/health", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
    const authentication = (await options.authenticateDevice?.(request.headers.authorization)) ?? {
      kind: "anonymous",
    };

    if (authentication.kind === "rejected") {
      await reply
        .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
        .header("WWW-Authenticate", "Bearer")
        .send(DEVICE_TOKEN_REJECTED);
      return;
    }

    await reply.send(
      healthCheckSchema.parse({
        status: "ok",
        version: options.version,
        ...(authentication.kind === "installation" && {
          installation: { revoked: authentication.installation.revoked },
        }),
      }),
    );
  });
}
