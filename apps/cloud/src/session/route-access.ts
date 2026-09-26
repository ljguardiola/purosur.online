import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RouteOptions,
} from "fastify";
import type { PermissionKey } from "../roles/permission-catalog.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import {
  type BackofficeSessionCheckOptions,
  checkBackofficeSession,
  type OpenSession,
  peekOpenSession,
  requireOpenSession,
  UNAUTHENTICATED_RESPONSE,
} from "./open-session.js";
import { readSessionCookie } from "./session-cookie.js";

/**
 * The one access level a route declares through its `config.access`:
 * - `public`: no session is required at all.
 * - `open_session`: any open session qualifies, and the request counts as use of it (touches
 *   `last_seen_at`).
 * - `open_session_peek`: any open session qualifies, without counting as use of it, so probing a
 *   session's status never keeps an idle one alive.
 * - `session_cookie`: a session cookie is enough, open or already ended, so signing out of an
 *   ended session still succeeds.
 * - `administrator`: only the Administrator role qualifies, never through a permission.
 * - `permission`: holding one named catalog permission qualifies; an Administrator always does.
 *   Declaring more than one permission is an any-of: holding at least one of them qualifies.
 */
export type RouteAccess =
  | { level: "public" }
  | { level: "open_session" }
  | { level: "open_session_peek" }
  | { level: "session_cookie" }
  | { level: "administrator" }
  | { level: "permission"; permission: PermissionKey | readonly PermissionKey[] };

export const PUBLIC_ACCESS: RouteAccess = { level: "public" };
export const OPEN_SESSION_ACCESS: RouteAccess = { level: "open_session" };
export const OPEN_SESSION_PEEK_ACCESS: RouteAccess = { level: "open_session_peek" };
export const SESSION_COOKIE_ACCESS: RouteAccess = { level: "session_cookie" };
export const ADMINISTRATOR_ACCESS: RouteAccess = { level: "administrator" };

export function permissionAccess(
  permission: PermissionKey | readonly PermissionKey[],
): RouteAccess {
  return { level: "permission", permission };
}

type SessionCheck<TResult> = <TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
) => Promise<TResult>;

/** The database and clock a route's session is checked against, whatever driver it runs on. */
export interface RouteSessionSource {
  check<TResult>(
    sessionCheck: SessionCheck<TResult>,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<TResult>;
}

export function routeSessionSource<TQueryResult extends PgQueryResultHKT>(options: {
  db: PgDatabase<TQueryResult>;
  now?: () => Date;
}): RouteSessionSource {
  const now = options.now ?? (() => new Date());
  return {
    check: (sessionCheck, request, reply) =>
      sessionCheck(request, reply, { db: options.db, now: now() }),
  };
}

declare module "fastify" {
  interface FastifyContextConfig {
    /** The route's declared access level, enforced before its handler runs. */
    access?: RouteAccess;
    /** Where the session is checked, for every declared level other than `public`. */
    sessionSource?: RouteSessionSource;
  }

  interface FastifyInstance {
    /** Every route registered since `registerRouteAccess`, with its declared access. */
    routeAccessInventory(): RouteAccessEntry[];
  }
}

export interface RouteAccessEntry {
  method: string;
  url: string;
  access: RouteAccess | undefined;
}

const resolvedSessions = new WeakMap<FastifyRequest, OpenSession>();
const resolvedSessionCookies = new WeakMap<FastifyRequest, string>();

/** The session cookie a `session_cookie` route's declared access required before its handler ran. */
export function sessionCookieOf(request: FastifyRequest): string {
  const rawSessionId = resolvedSessionCookies.get(request);
  if (!rawSessionId) {
    throw new Error(
      `${request.method} ${request.routeOptions.url} read a session cookie its declared access never required`,
    );
  }
  return rawSessionId;
}

/**
 * The open session the route's declared access resolved before its handler ran. Only a route
 * declaring `open_session`, `open_session_peek`, `administrator`, or a `permission` has one.
 */
export function openSessionOf(request: FastifyRequest): OpenSession {
  const session = resolvedSessions.get(request);
  if (!session) {
    throw new Error(
      `${request.method} ${request.routeOptions.url} read an open session its declared access never resolved`,
    );
  }
  return session;
}

/**
 * Adapts a route's own origin check to a `preHandler`, so it runs before the declared access is
 * enforced (the enforcement is appended after the route's own `preHandler`s).
 */
export function originGuard(
  check: (request: FastifyRequest, reply: FastifyReply) => boolean,
): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    if (!check(request, reply)) {
      return reply;
    }
  };
}

export function isAccessGranted(
  access: RouteAccess,
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): boolean {
  switch (access.level) {
    case "public":
    case "open_session":
    case "open_session_peek":
    case "session_cookie":
      return true;
    case "administrator":
      return session.isAdministrator;
    case "permission": {
      const declaredPermissions = Array.isArray(access.permission)
        ? access.permission
        : [access.permission as PermissionKey];
      return (
        session.isAdministrator ||
        declaredPermissions.some((permission) => session.permissionKeys.includes(permission))
      );
    }
  }
}

async function refuse(reply: FastifyReply, code: 401 | 403): Promise<FastifyReply> {
  await reply.code(code).send(code === 401 ? UNAUTHENTICATED_RESPONSE : FORBIDDEN_RESPONSE);
  return reply;
}

async function enforceDeclaredAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const { access, sessionSource } = request.routeOptions.config;
  if (!access) {
    return refuse(reply, 403);
  }
  if (access.level === "public") {
    return undefined;
  }
  if (!sessionSource) {
    throw new Error(`${request.method} ${request.routeOptions.url} has no session source`);
  }

  if (access.level === "session_cookie") {
    const rawSessionId = readSessionCookie(request.headers.cookie);
    if (!rawSessionId) {
      return refuse(reply, 401);
    }
    const check = await sessionSource.check(checkBackofficeSession, request, reply);
    if (check.state === "rate_limited") {
      return reply;
    }
    resolvedSessionCookies.set(request, rawSessionId);
    return undefined;
  }

  const session = await sessionSource.check(
    access.level === "open_session_peek" ? peekOpenSession : requireOpenSession,
    request,
    reply,
  );
  if (!session) {
    return reply;
  }
  if (!isAccessGranted(access, session)) {
    return refuse(reply, 403);
  }
  resolvedSessions.set(request, session);
  return undefined;
}

/**
 * Declares `access` for every route a third-party plugin registers inside `scope`, for a plugin
 * (like `@fastify/static`) that takes no per-route config of its own. Only reaches routes
 * registered in that encapsulated scope, never the rest of the app.
 */
export function declarePluginRoutesAccess(scope: FastifyInstance, access: RouteAccess): void {
  scope.addHook("onRoute", (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, access };
  });
}

function declaredAccessOf(routeOptions: RouteOptions): RouteAccess | undefined {
  return routeOptions.config?.access;
}

/**
 * Installs, once per app, the one mechanism that enforces every route's declared `config.access`
 * before its handler: each route registered afterwards gets `enforceDeclaredAccess` appended to its
 * own `preHandler`s (so a route's origin guard still runs first), and is recorded for
 * `routeAccessInventory()`. Every route-registration function calls it, so a route registered on a
 * bare `Fastify()` instance in a test is enforced exactly as in the built app. A route with no
 * declaration is refused with 403, and one declaring a session level without a session source
 * can't be registered at all.
 */
export function registerRouteAccess(app: FastifyInstance): void {
  if (app.hasDecorator("routeAccessInventory")) {
    return;
  }

  const registered: { method: string; url: string; routeOptions: RouteOptions }[] = [];
  const declaredGetConfigs = new Map<string, RouteOptions["config"]>();

  app.addHook("onRoute", (routeOptions) => {
    const access = declaredAccessOf(routeOptions);
    if (access && access.level !== "public" && !routeOptions.config?.sessionSource) {
      throw new Error(
        `${String(routeOptions.method)} ${routeOptions.url} declares ${access.level} access but no session source`,
      );
    }

    const ownPreHandlers = routeOptions.preHandler ?? [];
    routeOptions.preHandler = [
      ...(Array.isArray(ownPreHandlers) ? ownPreHandlers : [ownPreHandlers]),
      enforceDeclaredAccess,
    ];

    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    // Fastify registers a GET's mirrored HEAD right after it, from the same options, so it shares
    // the GET's very `config` object; a HEAD registered any other way is recorded on its own.
    const mirrorsDeclaredGet =
      routeOptions.method === "HEAD" &&
      access !== undefined &&
      declaredGetConfigs.get(routeOptions.url) === routeOptions.config;
    if (mirrorsDeclaredGet) {
      return;
    }
    if (access !== undefined && methods.includes("GET")) {
      declaredGetConfigs.set(routeOptions.url, routeOptions.config);
    }
    for (const method of methods) {
      registered.push({ method, url: routeOptions.url, routeOptions });
    }
  });

  app.decorate("routeAccessInventory", (): RouteAccessEntry[] =>
    registered.map(({ method, url, routeOptions }) => ({
      method,
      url,
      access: declaredAccessOf(routeOptions),
    })),
  );
}
