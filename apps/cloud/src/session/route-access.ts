import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PermissionKey } from "../roles/permission-catalog.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import {
  type BackofficeSessionCheckOptions,
  type OpenSession,
  requireOpenSession,
} from "./open-session.js";

/**
 * The one access level a route declares through its `config.access` (see the module augmentation
 * below): no session is required at all, any open session qualifies, only the Administrator role
 * qualifies, or holding one named catalog permission qualifies. An Administrator always satisfies
 * `open_session` and `permission`, but never satisfies `administrator` through a permission — that
 * level only ever passes because the session itself is an Administrator's.
 */
export type RouteAccess =
  | { level: "public" }
  | { level: "open_session" }
  | { level: "administrator" }
  | { level: "permission"; permission: PermissionKey };

export const PUBLIC_ACCESS: RouteAccess = { level: "public" };
export const OPEN_SESSION_ACCESS: RouteAccess = { level: "open_session" };
export const ADMINISTRATOR_ACCESS: RouteAccess = { level: "administrator" };

export function permissionAccess(permission: PermissionKey): RouteAccess {
  return { level: "permission", permission };
}

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * The route's declared access level. Every route registered by this app must set this (see
     * `registerRouteAccessInventory`'s consumer, the route-inventory test in `app.test.ts`), so a
     * future endpoint can't ship without one.
     */
    access?: RouteAccess;
  }

  interface FastifyInstance {
    /** Decorated by `registerRouteAccessInventory` so a test can read the built app's inventory back. */
    routeAccessInventory(): RouteAccessEntry[];
  }
}

function isAccessGranted(access: RouteAccess, session: OpenSession): boolean {
  // An Administrator passes every permission and open-session check, but "administrator" itself is
  // decided below by the branch it falls into, never by a permission key.
  if (session.isAdministrator) {
    return true;
  }
  switch (access.level) {
    case "public":
    case "open_session":
      return true;
    case "administrator":
      return false;
    case "permission":
      return session.permissionKeys.includes(access.permission);
  }
}

/**
 * The one central enforcement point for a route's declared `config.access`: resolves the open
 * session (401 `unauthenticated` as `requireOpenSession` already answers, touching `last_seen_at`)
 * and, only once a session is open, checks it against the route's declared level, answering 403
 * `FORBIDDEN_RESPONSE` when it doesn't qualify. Returns the resolved session for the handler to use,
 * so it never resolves the session a second time.
 *
 * Registered as a plain function a handler calls, not a Fastify hook: several route-registration
 * functions in this app are unit-tested by registering them directly on a bare `Fastify()` instance
 * (no `buildApp`), so a hook wired only in `app.ts` would silently stop enforcing in those tests. A
 * plain function enforces identically everywhere the route itself is registered, and — called at
 * the exact place `requireOpenSession` used to be — runs after the route's own existing origin
 * guard, which stays exactly where it is.
 */
export async function enforceRouteAccess<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const openSession = await requireOpenSession(request, reply, options);
  if (!openSession) {
    return undefined;
  }

  const access = request.routeOptions.config.access;
  if (!access || !isAccessGranted(access, openSession)) {
    await reply.code(403).send(FORBIDDEN_RESPONSE);
    return undefined;
  }

  return openSession;
}

export interface RouteAccessEntry {
  method: string;
  url: string;
  access: RouteAccess | undefined;
}

/**
 * Collects every route's declared `config.access` as it is registered, for the route-inventory test
 * to read back once the app is fully built (both as this function's own return value and, so a test
 * that only has the built app can reach it, as the app's decorated `routeAccessInventory()`). Must
 * be called right after the `Fastify()` instance is created and before any route is registered,
 * since Fastify's `onRoute` hook only fires for routes registered after it is added. Fastify
 * auto-registers a mirrored HEAD route for every GET with the same config; those are excluded here
 * since none of this app's routes ever declares HEAD access independently of its GET.
 */
export function registerRouteAccessInventory(app: FastifyInstance): () => RouteAccessEntry[] {
  const entries: RouteAccessEntry[] = [];

  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    for (const method of methods) {
      if (method === "HEAD") {
        continue;
      }
      entries.push({
        method,
        url: routeOptions.url,
        access: (routeOptions.config as { access?: RouteAccess } | undefined)?.access,
      });
    }
  });

  const getInventory = (): RouteAccessEntry[] => [...entries];
  app.decorate("routeAccessInventory", getInventory);
  return getInventory;
}
