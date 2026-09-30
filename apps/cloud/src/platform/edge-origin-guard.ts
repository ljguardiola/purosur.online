import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Set by a Cloudflare header-transform rule on every forwarded request; kept off Cloudflare's own `cf-`/`x-cf-` namespace. */
export const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

const DIRECT_ACCESS_REJECTED_RESPONSE = {
  code: "direct_access_rejected",
  message: "this request did not come through the edge",
} as const;

const HEALTH_CHECK_ROUTE = "/api/health";

/**
 * Railway's own healthcheck reaches the container directly, bypassing Cloudflare. Fastify's
 * routing runs before `onRequest`, so the matched route is compared instead of the raw URL.
 */
function isExemptHealthCheck(request: FastifyRequest): boolean {
  return request.method === "GET" && request.routeOptions.url === HEALTH_CHECK_ROUTE;
}

function readEdgeOriginSecretHeader(request: FastifyRequest): string | undefined {
  const header = request.headers[EDGE_ORIGIN_SECRET_HEADER];
  return Array.isArray(header) ? header[0] : header;
}

/** `timingSafeEqual` throws instead of returning false for differing lengths, so length is checked first. */
export function edgeOriginSecretMatches(expected: string, received: string | undefined): boolean {
  if (received === undefined) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function registerEdgeOriginGuard(app: FastifyInstance, edgeOriginSecret: string): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isExemptHealthCheck(request)) {
      return;
    }
    if (edgeOriginSecretMatches(edgeOriginSecret, readEdgeOriginSecretHeader(request))) {
      return;
    }
    await reply.code(403).send(DIRECT_ACCESS_REJECTED_RESPONSE);
  });
}
