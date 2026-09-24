import { extname, relative, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { registerEdgeOriginGuard } from "./edge-origin-guard.js";
import type { PasskeysListRouteOptions } from "./passkeys/passkeys-list-route.js";
import { registerPasskeysListRoute } from "./passkeys/passkeys-list-route.js";
import { registerPasskeyRegistrationRoutes } from "./passkeys/passkeys-registration-route.js";
import { registerPasskeyRemovalRoutes } from "./passkeys/passkeys-removal-route.js";
import { registerRecoveryRedemptionRoutes } from "./recovery/recovery-redemption-route.js";
import type { RecoveryRouteOptions } from "./recovery/request-recovery-route.js";
import { registerRecoveryRoutes } from "./recovery/request-recovery-route.js";
import { registerRoleCreationRoutes } from "./roles/role-creation-route.js";
import { registerRoleEditRoutes } from "./roles/role-edit-route.js";
import { registerRoleReadRoute } from "./roles/role-read-route.js";
import type { RolesRouteOptions } from "./roles/roles-list-route.js";
import { registerRolesListRoute } from "./roles/roles-list-route.js";
import type { SessionAuthenticateRouteOptions } from "./session/session-authenticate-route.js";
import { registerSessionAuthenticateRoute } from "./session/session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session/session-authentication-options-route.js";
import { registerSessionAuthorizationRoutes } from "./session/session-authorization-route.js";
import { registerSessionReadRoute } from "./session/session-read-route.js";
import { registerSessionSignOutRoute } from "./session/session-sign-out-route.js";
import { registerSessionStatusRoute } from "./session/session-status-route.js";
import { registerUserCreationRoutes } from "./users/user-creation-route.js";
import { registerUserEmailChangeRoutes } from "./users/user-email-change-route.js";
import { registerUserPasskeyRemovalRoutes } from "./users/user-passkey-removal-route.js";
import { registerUserPasskeysListRoute } from "./users/user-passkeys-list-route.js";
import { registerUserReadRoute } from "./users/user-read-route.js";
import type { UsersRouteOptions } from "./users/users-list-route.js";
import { registerUsersListRoute } from "./users/users-list-route.js";

export interface BuildAppOptions<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT> {
  /** The deployed version (commit SHA), reported by `GET /health`. */
  version: string;
  /**
   * The value Cloudflare's edge sets on every request it forwards (see `edge-origin-guard.ts`).
   * Required so a missing secret can never leave the guard silently open.
   */
  edgeOriginSecret: string;
  /**
   * Wires unhandled route errors to Sentry. Defaults to `@sentry/node`'s own
   * `setupFastifyErrorHandler`; a caller injects a fake to prove the wiring in a test without a
   * live Sentry client.
   */
  setupFastifyErrorHandler?: (app: FastifyInstance) => void;
  /**
   * The backoffice's build (its `dist/`, containing `index.html`). A GET or HEAD for a path with
   * no file extension that matches neither a route nor a file gets `index.html`, so the
   * backoffice's client-side router handles deep links.
   */
  staticDir?: string | undefined;
  /**
   * Registers every `POST /users/recovery/*` route (request, registration-options, redeem) when
   * given. Left out, the service still starts (e.g. in a test that has no database), the same
   * way `staticDir` is optional above.
   */
  recovery?: RecoveryRouteOptions<TQueryResult>;
  /**
   * Registers every `/users/session/*` route (`authentication-options`, `authenticate`, the
   * session-read `GET /users/session`, its non-touching `status`, `sign-out`, and the passkey-
   * authorization pair `authorization-options`/`authorization` behind every sensitive action's
   * shared 5-minute window, see `passkey-authorization-guard.ts`) when given, the same
   * optional-feature-wiring shape `recovery` uses above.
   */
  session?: SessionAuthenticateRouteOptions<TQueryResult>;
  /**
   * Registers `GET /users/passkeys` and every `/users/passkeys/*` self-management route
   * (registration, which stays its own two-step WebAuthn ceremony, and removal, gated by the
   * shared passkey-authorization window) for the session account's own passkeys, the same
   * optional-feature-wiring shape `session` uses above.
   */
  passkeys?: PasskeysListRouteOptions<TQueryResult>;
  /**
   * Registers `GET /users`, `GET /users/:id`, `POST /users`, `POST /users/:id/email`, `GET
   * /users/:id/passkeys`, and `POST /users/:id/passkeys/:passkeyId/remove`, the backoffice Users
   * screen's read, create, email-edit, and passkey-removal sides: every mutating one is
   * Administrator-only, scoped to the session's own branch, and gated by the shared
   * passkey-authorization window, the same optional-feature-wiring shape `session` uses above.
   */
  users?: UsersRouteOptions<TQueryResult>;
  /**
   * Registers `GET /roles`, `GET /roles/:id`, `POST /roles`, and `POST /roles/:id/edit`, the
   * backoffice Roles screen's read, create, and edit sides: every mutating one is
   * Administrator-only and gated by the shared passkey-authorization window, the same
   * optional-feature-wiring shape `users` uses above.
   */
  roles?: RolesRouteOptions<TQueryResult>;
}

const backofficeSecurityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

// Vite names every file under assets/ by its content hash, so an asset URL never changes content.
function cacheControlFor(staticDir: string, filePath: string): string {
  const [topLevel] = relative(staticDir, filePath).split(sep);
  return topLevel === "assets" ? "public, max-age=31536000, immutable" : "no-cache";
}

export function buildApp<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT>(
  options: BuildAppOptions<TQueryResult>,
): FastifyInstance {
  const app = Fastify();

  const setupFastifyErrorHandler =
    options.setupFastifyErrorHandler ?? defaultSetupFastifyErrorHandler;
  setupFastifyErrorHandler(app);

  registerEdgeOriginGuard(app, options.edgeOriginSecret);

  app.get("/health", async () => ({ status: "ok", version: options.version }));

  if (options.recovery) {
    registerRecoveryRoutes(app, options.recovery);
    registerRecoveryRedemptionRoutes(app, options.recovery);
  }

  if (options.session) {
    registerSessionAuthenticationOptionsRoute(app, options.session);
    registerSessionAuthenticateRoute(app, options.session);
    registerSessionReadRoute(app, options.session);
    registerSessionStatusRoute(app, options.session);
    registerSessionSignOutRoute(app, options.session);
    registerSessionAuthorizationRoutes(app, options.session);
  }

  if (options.passkeys) {
    registerPasskeysListRoute(app, options.passkeys);
    registerPasskeyRegistrationRoutes(app, options.passkeys);
    registerPasskeyRemovalRoutes(app, options.passkeys);
  }

  if (options.users) {
    registerUsersListRoute(app, options.users);
    registerUserReadRoute(app, options.users);
    registerUserCreationRoutes(app, options.users);
    registerUserEmailChangeRoutes(app, options.users);
    registerUserPasskeysListRoute(app, options.users);
    registerUserPasskeyRemovalRoutes(app, options.users);
  }

  if (options.roles) {
    registerRolesListRoute(app, options.roles);
    registerRoleReadRoute(app, options.roles);
    registerRoleCreationRoutes(app, options.roles);
    registerRoleEditRoutes(app, options.roles);
  }

  const staticDir = options.staticDir;
  if (staticDir) {
    app.register(fastifyStatic, {
      root: staticDir,
      setHeaders: (reply, filePath) => {
        reply.headers(backofficeSecurityHeaders);
        reply.header("Cache-Control", cacheControlFor(staticDir, filePath));
      },
    });
    app.setNotFoundHandler((request, reply) => {
      const isClientRoute = extname(new URL(request.url, "http://localhost").pathname) === "";
      if ((request.method !== "GET" && request.method !== "HEAD") || !isClientRoute) {
        reply.code(404).send();
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
