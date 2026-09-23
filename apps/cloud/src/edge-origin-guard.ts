import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Set by a Cloudflare request-header transform rule (phase `http_request_late_transform`) on
 * every request it forwards to the origin. Kept off the `cf-`/`x-cf-` namespace Cloudflare
 * reserves for its own headers.
 */
export const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

export const DIRECT_ACCESS_REJECTED_RESPONSE = {
  code: "direct_access_rejected",
  message: "this request did not come through the edge",
} as const;

const HEALTH_CHECK_ROUTE = "/health";

/**
 * Railway's own healthcheck reaches the container directly, bypassing Cloudflare. Routing runs
 * before `onRequest`, so the matched route (undefined when nothing matched) is compared instead
 * of the raw URL, in which the router does not resolve dot segments.
 */
function isExemptHealthCheck(request: FastifyRequest): boolean {
  return request.method === "GET" && request.routeOptions.url === HEALTH_CHECK_ROUTE;
}

function readEdgeOriginSecretHeader(request: FastifyRequest): string | undefined {
  const header = request.headers[EDGE_ORIGIN_SECRET_HEADER];
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Constant-time comparison of equal-length buffers; a length mismatch is decided (and reported)
 * before calling `timingSafeEqual`, which throws instead of returning false for differing
 * lengths.
 */
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

/**
 * Refuses any request that did not pass through Cloudflare's edge with 403
 * `direct_access_rejected`, before any route logic runs. The only exemption is `GET /health`.
 */
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
