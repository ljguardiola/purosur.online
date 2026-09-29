import { extname, relative, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import type { ErrorReportingConfiguration } from "@purosur/contracts";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PasskeysListRouteOptions } from "./access/passkeys-list-route.js";
import { registerPasskeysListRoute } from "./access/passkeys-list-route.js";
import { registerPasskeyRegistrationRoutes } from "./access/passkeys-registration-route.js";
import { registerPasskeyRemovalRoutes } from "./access/passkeys-removal-route.js";
import { registerRecoveryRedemptionRoutes } from "./access/recovery-redemption-route.js";
import type { RecoveryRouteOptions } from "./access/request-recovery-route.js";
import { registerRecoveryRoutes } from "./access/request-recovery-route.js";
import { registerRoleCreationRoutes } from "./access/role-creation-route.js";
import { registerRoleEditRoutes } from "./access/role-edit-route.js";
import { registerRoleReadRoute } from "./access/role-read-route.js";
import type { RolesRouteOptions } from "./access/roles-list-route.js";
import { registerRolesListRoute } from "./access/roles-list-route.js";
import {
  declarePluginRoutesAccess,
  PUBLIC_ACCESS,
  registerRouteAccess,
} from "./access/route-access.js";
import type { SessionAuthenticateRouteOptions } from "./access/session-authenticate-route.js";
import { registerSessionAuthenticateRoute } from "./access/session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "./access/session-authentication-options-route.js";
import { registerSessionAuthorizationRoutes } from "./access/session-authorization-route.js";
import { registerSessionReadRoute } from "./access/session-read-route.js";
import { registerSessionSignOutRoute } from "./access/session-sign-out-route.js";
import { registerSessionStatusRoute } from "./access/session-status-route.js";
import { registerUserCreationRoutes } from "./access/user-creation-route.js";
import { registerUserDeactivationRoutes } from "./access/user-deactivation-route.js";
import { registerUserEditRoutes } from "./access/user-edit-route.js";
import { registerUserPasskeyRemovalRoutes } from "./access/user-passkey-removal-route.js";
import { registerUserPasskeysListRoute } from "./access/user-passkeys-list-route.js";
import { registerUserReactivationRoutes } from "./access/user-reactivation-route.js";
import { registerUserReadRoute } from "./access/user-read-route.js";
import type { UsersRouteOptions } from "./access/users-list-route.js";
import { registerUsersListRoute } from "./access/users-list-route.js";
import { registerAlertCloseRoute } from "./alerts/alert-close-route.js";
import { registerAlertReadRoute } from "./alerts/alert-read-route.js";
import type { AlertsRouteOptions } from "./alerts/alerts-list-route.js";
import { registerAlertsListRoute } from "./alerts/alerts-list-route.js";
import { registerAlertsOverviewRoute } from "./alerts/alerts-overview-route.js";
import { registerBranchSettingsEditRoute } from "./branch/branch-settings-edit-route.js";
import type { BranchSettingsRouteOptions } from "./branch/branch-settings-read-route.js";
import { registerBranchSettingsReadRoute } from "./branch/branch-settings-read-route.js";
import { registerBrandCreationRoute } from "./catalog/brand-creation-route.js";
import { registerBrandDeactivationRoute } from "./catalog/brand-deactivation-route.js";
import { registerBrandEditRoute } from "./catalog/brand-edit-route.js";
import { registerBrandReactivationRoute } from "./catalog/brand-reactivation-route.js";
import type { BrandsRouteOptions } from "./catalog/brands-list-route.js";
import { registerBrandsListRoute } from "./catalog/brands-list-route.js";
import type { CategoriesRouteOptions } from "./catalog/categories-list-route.js";
import { registerCategoriesListRoute } from "./catalog/categories-list-route.js";
import { registerCategoryCreationRoute } from "./catalog/category-creation-route.js";
import { registerCategoryEditRoute } from "./catalog/category-edit-route.js";
import { registerInternalBarcodeRoute } from "./catalog/internal-barcode-route.js";
import { registerProductCreationRoute } from "./catalog/product-creation-route.js";
import { registerProductDeactivationRoute } from "./catalog/product-deactivation-route.js";
import { registerProductEditRoute } from "./catalog/product-edit-route.js";
import { registerProductLabelsRoute } from "./catalog/products-labels-route.js";
import type { ProductsRouteOptions } from "./catalog/products-list-route.js";
import { registerProductsListRoute } from "./catalog/products-list-route.js";
import { registerIssuerIdentificationEditRoute } from "./fiscal/issuer-identification-edit-route.js";
import type { IssuerIdentificationRouteOptions } from "./fiscal/issuer-identification-read-route.js";
import { registerIssuerIdentificationReadRoute } from "./fiscal/issuer-identification-read-route.js";
import { registerEdgeOriginGuard } from "./platform/edge-origin-guard.js";
import { registerHealthRoute } from "./platform/health-route.js";
import { registerPriceConfirmationRoute } from "./pricing/price-confirmation-route.js";
import { registerPriceSetRoute } from "./pricing/price-set-route.js";
import type { PricesRouteOptions } from "./pricing/prices-list-route.js";
import { registerPricesListRoute } from "./pricing/prices-list-route.js";
import { authenticateDevice } from "./register/device-authentication.js";
import type { DeviceEnrollmentRouteOptions } from "./register/device-enrollment-route.js";
import { registerDeviceEnrollmentRoute } from "./register/device-enrollment-route.js";
import { registerRegisterCoverageRoute } from "./register/register-coverage-route.js";
import { registerRegisterCreationRoute } from "./register/register-creation-route.js";
import { registerRegisterEnrollmentCodeRoute } from "./register/register-enrollment-code-route.js";
import type { RegistersRouteOptions } from "./register/registers-list-route.js";
import { registerRegistersListRoute } from "./register/registers-list-route.js";

export interface BuildAppOptions<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT> {
  version: string;
  errorReporting?: BackofficeErrorReporting;
  edgeOriginSecret: string;
  setupFastifyErrorHandler?: (app: FastifyInstance) => void;
  staticDir?: string | undefined;
  recovery?: RecoveryRouteOptions<TQueryResult>;
  session?: SessionAuthenticateRouteOptions<TQueryResult>;
  passkeys?: PasskeysListRouteOptions<TQueryResult>;
  users?: UsersRouteOptions<TQueryResult>;
  roles?: RolesRouteOptions<TQueryResult>;
  branchSettings?: BranchSettingsRouteOptions<TQueryResult>;
  issuerIdentification?: IssuerIdentificationRouteOptions<TQueryResult>;
  categories?: CategoriesRouteOptions<TQueryResult>;
  brands?: BrandsRouteOptions<TQueryResult>;
  products?: ProductsRouteOptions<TQueryResult>;
  alerts?: AlertsRouteOptions<TQueryResult>;
  prices?: PricesRouteOptions<TQueryResult>;
  registers?: RegistersRouteOptions<TQueryResult>;
  devices?: DeviceEnrollmentRouteOptions<TQueryResult>;
}

const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains";

export interface BackofficeErrorReporting {
  dsn: string;
  environment: string;
}

function errorReportingOrigin(dsn: string): string {
  try {
    return new URL(dsn).origin;
  } catch (cause) {
    throw new Error("BACKOFFICE_SENTRY_DSN must be a URL", { cause });
  }
}

function backofficeSecurityHeaders(
  errorReporting: BackofficeErrorReporting | undefined,
): Record<string, string> {
  const connectSources = ["'self'"];
  if (errorReporting) {
    connectSources.push(errorReportingOrigin(errorReporting.dsn));
  }
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self'",
      `connect-src ${connectSources.join(" ")}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

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

  // Fastify answers some requests, such as one whose URL is not valid percent-encoding, straight on
  // the raw response without running any hook.
  app.server.prependListener("request", (_request, response) => {
    response.setHeader("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
  });

  registerEdgeOriginGuard(app, options.edgeOriginSecret);

  const devices = options.devices;
  registerHealthRoute(app, {
    version: options.version,
    ...(devices && {
      authenticateDevice: (authorization) => authenticateDevice(devices.db, authorization),
    }),
  });

  const errorReporting: ErrorReportingConfiguration = options.errorReporting
    ? { enabled: true, ...options.errorReporting, release: options.version }
    : { enabled: false };
  app.get("/error-reporting", { config: { access: PUBLIC_ACCESS } }, async () => errorReporting);

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

  if (options.brands) {
    registerBrandsListRoute(app, options.brands);
    registerBrandCreationRoute(app, options.brands);
    registerBrandEditRoute(app, options.brands);
    registerBrandDeactivationRoute(app, options.brands);
    registerBrandReactivationRoute(app, options.brands);
  }

  if (options.products) {
    registerProductsListRoute(app, options.products);
    registerProductCreationRoute(app, options.products);
    registerProductEditRoute(app, options.products);
    registerProductDeactivationRoute(app, options.products);
    registerInternalBarcodeRoute(app, options.products);
    registerProductLabelsRoute(app, options.products);
  }

  if (options.alerts) {
    registerAlertsListRoute(app, options.alerts);
    registerAlertsOverviewRoute(app, options.alerts);
    registerAlertReadRoute(app, options.alerts);
    registerAlertCloseRoute(app, options.alerts);
  }

  if (options.prices) {
    registerPricesListRoute(app, options.prices);
    registerPriceSetRoute(app, options.prices);
    registerPriceConfirmationRoute(app, options.prices);
  }

  if (options.registers) {
    registerRegistersListRoute(app, options.registers);
    registerRegisterCreationRoute(app, options.registers);
    registerRegisterCoverageRoute(app, options.registers);
    registerRegisterEnrollmentCodeRoute(app, options.registers);
  }

  if (options.devices) {
    registerDeviceEnrollmentRoute(app, options.devices);
  }

  const staticDir = options.staticDir;
  const securityHeaders = backofficeSecurityHeaders(options.errorReporting);
  if (staticDir) {
    app.register(async (staticScope) => {
      declarePluginRoutesAccess(staticScope, PUBLIC_ACCESS);
      await staticScope.register(fastifyStatic, {
        root: staticDir,
        setHeaders: (reply, filePath) => {
          reply.headers(securityHeaders);
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
