import { extname, relative, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { registerBranchSettingsEditRoute } from "./branch-settings/branch-settings-edit-route.js";
import type { BranchSettingsRouteOptions } from "./branch-settings/branch-settings-read-route.js";
import { registerBranchSettingsReadRoute } from "./branch-settings/branch-settings-read-route.js";
import type { CategoriesRouteOptions } from "./categories/categories-list-route.js";
import { registerCategoriesListRoute } from "./categories/categories-list-route.js";
import { registerCategoryCreationRoute } from "./categories/category-creation-route.js";
import { registerCategoryEditRoute } from "./categories/category-edit-route.js";
import { registerEdgeOriginGuard } from "./edge-origin-guard.js";
import { registerIssuerIdentificationEditRoute } from "./fiscal-configuration/issuer-identification-edit-route.js";
import type { IssuerIdentificationRouteOptions } from "./fiscal-configuration/issuer-identification-read-route.js";
import { registerIssuerIdentificationReadRoute } from "./fiscal-configuration/issuer-identification-read-route.js";
import type { PasskeysListRouteOptions } from "./passkeys/passkeys-list-route.js";
import { registerPasskeysListRoute } from "./passkeys/passkeys-list-route.js";
import { registerPasskeyRegistrationRoutes } from "./passkeys/passkeys-registration-route.js";
import { registerPasskeyRemovalRoutes } from "./passkeys/passkeys-removal-route.js";
import { registerPriceConfirmationRoute } from "./prices/price-confirmation-route.js";
import { registerPriceSetRoute } from "./prices/price-set-route.js";
import type { PricesRouteOptions } from "./prices/prices-list-route.js";
import { registerPricesListRoute } from "./prices/prices-list-route.js";
import { registerInternalBarcodeRoute } from "./products/internal-barcode-route.js";
import { registerProductCreationRoute } from "./products/product-creation-route.js";
import { registerProductDeactivationRoute } from "./products/product-deactivation-route.js";
import { registerProductEditRoute } from "./products/product-edit-route.js";
import { registerProductLabelsRoute } from "./products/products-labels-route.js";
import type { ProductsRouteOptions } from "./products/products-list-route.js";
import { registerProductsListRoute } from "./products/products-list-route.js";
import { registerRecoveryRedemptionRoutes } from "./recovery/recovery-redemption-route.js";
import type { RecoveryRouteOptions } from "./recovery/request-recovery-route.js";
import { registerRecoveryRoutes } from "./recovery/request-recovery-route.js";
import { registerRegisterCreationRoute } from "./registers/register-creation-route.js";
import { registerRegisterEnrollmentCodeRoute } from "./registers/register-enrollment-code-route.js";
import type { RegistersRouteOptions } from "./registers/registers-list-route.js";
import { registerRegistersListRoute } from "./registers/registers-list-route.js";
import { registerRoleCreationRoutes } from "./roles/role-creation-route.js";
import { registerRoleEditRoutes } from "./roles/role-edit-route.js";
import { registerRoleReadRoute } from "./roles/role-read-route.js";
import type { RolesRouteOptions } from "./roles/roles-list-route.js";
import { registerRolesListRoute } from "./roles/roles-list-route.js";
import {
  declarePluginRoutesAccess,
  PUBLIC_ACCESS,
  registerRouteAccess,
} from "./session/route-access.js";
import type { SessionAuthenticateRouteOptions } from "./session/session-authenticate-route.js";
import { registerSessionAuthenticateRoute } from "./session/session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./session/session-authentication-options-route.js";
import { registerSessionAuthorizationRoutes } from "./session/session-authorization-route.js";
import { registerSessionReadRoute } from "./session/session-read-route.js";
import { registerSessionSignOutRoute } from "./session/session-sign-out-route.js";
import { registerSessionStatusRoute } from "./session/session-status-route.js";
import { registerUserCreationRoutes } from "./users/user-creation-route.js";
import { registerUserDeactivationRoutes } from "./users/user-deactivation-route.js";
import { registerUserEditRoutes } from "./users/user-edit-route.js";
import { registerUserPasskeyRemovalRoutes } from "./users/user-passkey-removal-route.js";
import { registerUserPasskeysListRoute } from "./users/user-passkeys-list-route.js";
import { registerUserReactivationRoutes } from "./users/user-reactivation-route.js";
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
   * Registers `GET /users`, `GET /users/:id`, `POST /users`, `POST /users/:id/edit`, `GET
   * /users/:id/passkeys`, `POST /users/:id/passkeys/:passkeyId/remove`, `POST
   * /users/:id/deactivation`, and `POST /users/:id/reactivation`, the backoffice Users screen's
   * read, create, email-and-role-edit, passkey-removal, deactivation, and reactivation sides:
   * every mutating one is scoped to the session's own branch and gated by the shared
   * passkey-authorization window, the same optional-feature-wiring shape `session` uses above.
   * `GET /users` and `GET /users/:id` also answer a deactivated user, with an `active` field, to a
   * holder of `deactivate_users` or `reactivate_users`; every other route here only ever resolves
   * an active target.
   */
  users?: UsersRouteOptions<TQueryResult>;
  /**
   * Registers `GET /roles`, `GET /roles/:id`, `POST /roles`, and `POST /roles/:id/edit`, the
   * backoffice Roles screen's read, create, and edit sides: every mutating one is
   * Administrator-only and gated by the shared passkey-authorization window, the same
   * optional-feature-wiring shape `users` uses above.
   */
  roles?: RolesRouteOptions<TQueryResult>;
  /**
   * Registers `GET /branch-settings` and `PUT /branch-settings`, the backoffice Sucursal screen's
   * read and save sides: both gated by `configure_branch` (an Administrator always holds it
   * implicitly) and scoped to the session's own location, the same optional-feature-wiring shape
   * `roles` uses above.
   */
  branchSettings?: BranchSettingsRouteOptions<TQueryResult>;
  /**
   * Registers `GET /fiscal-configuration/issuer-identification` and `PUT
   * .../issuer-identification`, the backoffice fiscal configuration's business-wide taxpayer
   * identification: both gated by `change_fiscal_configuration` (an Administrator always holds it
   * implicitly), with `PUT` additionally requiring the shared passkey-authorization window before
   * it saves, the same optional-feature-wiring shape `roles` uses above.
   */
  issuerIdentification?: IssuerIdentificationRouteOptions<TQueryResult>;
  /**
   * Registers `GET /categories`, `POST /categories`, and `POST /categories/:id/edit`, the
   * backoffice Categories screen's list, create, and rename sides: every one is gated by the
   * `manage_products_and_categories` permission (an Administrator always holds it too), the same
   * optional-feature-wiring shape `roles` uses above.
   */
  categories?: CategoriesRouteOptions<TQueryResult>;
  /**
   * Registers `GET /products`, `POST /products`, `POST /products/:id/edit`, `POST
   * /products/:id/deactivation`, `POST /products/internal-barcode`, and `POST /products/labels`,
   * the backoffice Products screen's list, create, edit, deactivate, internal-barcode-allocation,
   * and printable-label-sheet sides: every one is gated by the `manage_products_and_categories`
   * permission (an Administrator always holds it too), the same optional-feature-wiring shape
   * `categories` uses above.
   */
  products?: ProductsRouteOptions<TQueryResult>;
  /**
   * Registers `GET /prices`, `POST /products/:id/price`, and `POST
   * /products/:id/price-confirmation`, the backoffice Prices screen's list, set, and
   * confirm-without-change sides: every one is gated by the `manage_prices_and_review` permission
   * (an Administrator always holds it too) and scoped to the price list the session's own branch
   * settings point at, the same optional-feature-wiring shape `products` uses above.
   */
  prices?: PricesRouteOptions<TQueryResult>;
  /**
   * Registers `GET /registers`, `POST /registers`, and `POST /registers/:id/enrollment-code`, the
   * backoffice Cajas registradoras screen's list, create, and code-emission sides: every one is
   * gated by the `enroll_register_devices` permission (an Administrator always holds it too), the
   * same optional-feature-wiring shape `categories` uses above.
   */
  registers?: RegistersRouteOptions<TQueryResult>;
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
  registerRouteAccess(app);

  const setupFastifyErrorHandler =
    options.setupFastifyErrorHandler ?? defaultSetupFastifyErrorHandler;
  setupFastifyErrorHandler(app);

  registerEdgeOriginGuard(app, options.edgeOriginSecret);

  app.get("/health", { config: { access: PUBLIC_ACCESS } }, async () => ({
    status: "ok",
    version: options.version,
  }));

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
    registerUserEditRoutes(app, options.users);
    registerUserPasskeysListRoute(app, options.users);
    registerUserPasskeyRemovalRoutes(app, options.users);
    registerUserDeactivationRoutes(app, options.users);
    registerUserReactivationRoutes(app, options.users);
  }

  if (options.roles) {
    registerRolesListRoute(app, options.roles);
    registerRoleReadRoute(app, options.roles);
    registerRoleCreationRoutes(app, options.roles);
    registerRoleEditRoutes(app, options.roles);
  }

  if (options.branchSettings) {
    registerBranchSettingsReadRoute(app, options.branchSettings);
    registerBranchSettingsEditRoute(app, options.branchSettings);
  }

  if (options.issuerIdentification) {
    registerIssuerIdentificationReadRoute(app, options.issuerIdentification);
    registerIssuerIdentificationEditRoute(app, options.issuerIdentification);
  }

  if (options.categories) {
    registerCategoriesListRoute(app, options.categories);
    registerCategoryCreationRoute(app, options.categories);
    registerCategoryEditRoute(app, options.categories);
  }

  if (options.products) {
    registerProductsListRoute(app, options.products);
    registerProductCreationRoute(app, options.products);
    registerProductEditRoute(app, options.products);
    registerProductDeactivationRoute(app, options.products);
    registerInternalBarcodeRoute(app, options.products);
    registerProductLabelsRoute(app, options.products);
  }

  if (options.prices) {
    registerPricesListRoute(app, options.prices);
    registerPriceSetRoute(app, options.prices);
    registerPriceConfirmationRoute(app, options.prices);
  }

  if (options.registers) {
    registerRegistersListRoute(app, options.registers);
    registerRegisterCreationRoute(app, options.registers);
    registerRegisterEnrollmentCodeRoute(app, options.registers);
  }

  const staticDir = options.staticDir;
  if (staticDir) {
    app.register(async (staticScope) => {
      declarePluginRoutesAccess(staticScope, PUBLIC_ACCESS);
      await staticScope.register(fastifyStatic, {
        root: staticDir,
        setHeaders: (reply, filePath) => {
          reply.headers(backofficeSecurityHeaders);
          reply.header("Cache-Control", cacheControlFor(staticDir, filePath));
        },
      });
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
