import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { originGuard } from "./route-access.js";

const FOREIGN_ORIGIN_MESSAGE = "the request's Origin does not match the backoffice's own origin";

function rejectAsCrossSite(reply: FastifyReply, message: string): false {
  void reply.code(403).send({ code: "origin_rejected", message });
  return false;
}

export function requireBackofficeOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  backofficeOrigin: string,
): boolean {
  if (request.headers.origin !== backofficeOrigin) {
    return rejectAsCrossSite(reply, FOREIGN_ORIGIN_MESSAGE);
  }
  return true;
}

export function backofficeOriginGuard(backofficeOrigin: string): preHandlerAsyncHookHandler {
  return originGuard((request, reply) => requireBackofficeOrigin(request, reply, backofficeOrigin));
}

// Origin is absent on a same-origin GET, so Sec-Fetch-Site (same-origin vs. cross-site, still
// allowed by SameSite=Lax) fills the gap; a request with neither header still passes unchecked.
export function checkRequestIsSameOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  backofficeOrigin: string,
): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== backofficeOrigin) {
    return rejectAsCrossSite(reply, FOREIGN_ORIGIN_MESSAGE);
  }

  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined && fetchSite !== "same-origin") {
    return rejectAsCrossSite(reply, "the request did not come from the backoffice itself");
  }

  return true;
}
