import { READABLE_EVENT_VERSIONS, readableEventVersionsSchema } from "@purosur/contracts";
import type { FastifyInstance } from "fastify";
import { RELEASE_CHECK_ACCESS, registerRouteAccess } from "../sessions/route-access.js";

export interface ReadableEventVersionsRouteOptions {
  releaseCheckToken: string | undefined;
}

export function registerReadableEventVersionsRoute(
  app: FastifyInstance,
  options: ReadableEventVersionsRouteOptions,
): void {
  registerRouteAccess(app);

  app.get(
    "/sync/readable-event-versions",
    {
      config: { access: RELEASE_CHECK_ACCESS, releaseCheckToken: options.releaseCheckToken },
    },
    async (_request, reply) => {
      await reply.send(
        readableEventVersionsSchema.parse({ event_versions: [...READABLE_EVENT_VERSIONS] }),
      );
    },
  );
}
