import { extname, relative, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import type { ErrorReportingConfiguration } from "@purosur/contracts";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import {
  type FirstPinCodeRouteOptions,
  registerFirstPinCodeRoute,
} from "./access/first-pin-code-route.js";
import type { PasskeysListRouteOptions } from "./access/passkeys-list-route.js";
import { registerPasskeysListRoute } from "./access/passkeys-list-route.js";
import { registerPasskeyRegistrationRoutes } from "./access/passkeys-registration-route.js";
import { registerPasskeyRemovalRoutes } from "./access/passkeys-removal-route.js";
import { registerPermissionCatalogRoute } from "./access/permission-catalog-route.js";
import { registerPinCodeRedemptionRoute } from "./access/pin-code-redemption-route.js";
import type { RecoveryJobQueue } from "./access/recovery-job-queue.js";
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
import { registerSignInLookupRoute } from "./access/sign-in-lookup-route.js";
import { registerUserCreationRoutes } from "./access/user-creation-route.js";
import { registerUserDeactivationRoutes } from "./access/user-deactivation-route.js";
import { registerUserEditRoutes } from "./access/user-edit-route.js";
import { registerUserPasskeyRemovalRoutes } from "./access/user-passkey-removal-route.js";
import { registerUserPasskeysListRoute } from "./access/user-passkeys-list-route.js";
import { registerUserPinCodeRoutes } from "./access/user-pin-code-route.js";
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
import { registerTagCreationRoute } from "./catalog/tag-creation-route.js";
import { registerTagDeactivationRoute } from "./catalog/tag-deactivation-route.js";
import { registerTagEditRoute } from "./catalog/tag-edit-route.js";
import { registerTagReactivationRoute } from "./catalog/tag-reactivation-route.js";
import type { TagsRouteOptions } from "./catalog/tags-list-route.js";
import { registerTagsListRoute } from "./catalog/tags-list-route.js";
import { registerBuyerIdentificationThresholdRecordRoute } from "./fiscal/buyer-identification-threshold-record-route.js";
import type { BuyerIdentificationThresholdsRouteOptions } from "./fiscal/buyer-identification-thresholds-list-route.js";
import { registerBuyerIdentificationThresholdsListRoute } from "./fiscal/buyer-identification-thresholds-list-route.js";
import { registerFiscalAddressCreationRoute } from "./fiscal/fiscal-address-creation-route.js";
import { registerFiscalAddressEditRoute } from "./fiscal/fiscal-address-edit-route.js";
import type { FiscalAddressesRouteOptions } from "./fiscal/fiscal-addresses-list-route.js";
import { registerFiscalAddressesListRoute } from "./fiscal/fiscal-addresses-list-route.js";
import { registerIssuerIdentificationEditRoute } from "./fiscal/issuer-identification-edit-route.js";
import type { IssuerIdentificationRouteOptions } from "./fiscal/issuer-identification-read-route.js";
import { registerIssuerIdentificationReadRoute } from "./fiscal/issuer-identification-read-route.js";
import { registerRegisterPointOfSaleConfigurationRoute } from "./fiscal/register-point-of-sale-configuration-route.js";
import type { RegistersPointsOfSaleRouteOptions } from "./fiscal/registers-points-of-sale-list-route.js";
import { registerRegistersPointsOfSaleListRoute } from "./fiscal/registers-points-of-sale-list-route.js";
import { registerEdgeOriginGuard } from "./platform/edge-origin-guard.js";
import { registerHealthRoute } from "./platform/health-route.js";
import { registerDiscountCreationRoute } from "./pricing/discount-creation-route.js";
import { registerDiscountEditRoute } from "./pricing/discount-edit-route.js";
import { registerDiscountTargetsRoute } from "./pricing/discount-targets-route.js";
import type { DiscountsRouteOptions } from "./pricing/discounts-list-route.js";
import { registerDiscountsListRoute } from "./pricing/discounts-list-route.js";
import { registerPriceConfirmationRoute } from "./pricing/price-confirmation-route.js";
import { registerPriceSetRoute } from "./pricing/price-set-route.js";
import type { PricesRouteOptions } from "./pricing/prices-list-route.js";
import { registerPricesListRoute } from "./pricing/prices-list-route.js";
import { authenticateDevice } from "./register/device-authentication.js";
import { registerDeviceEnrollmentRoute } from "./register/device-enrollment-route.js";
import { registerDeviceTokenRotationRoute } from "./register/device-token-rotation-route.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "./register/installation-token-ports.js";
import { registerRegisterCoverageRoute } from "./register/register-coverage-route.js";
import { registerRegisterCreationRoute } from "./register/register-creation-route.js";
import { registerRegisterEnrollmentCodeRoute } from "./register/register-enrollment-code-route.js";
import type { RegistersRouteOptions } from "./register/registers-list-route.js";
import { registerRegistersListRoute } from "./register/registers-list-route.js";
import { registerStockBalancesRoute } from "./stock/stock-balances-route.js";
import { registerStockCountsRoutes } from "./stock/stock-counts-route.js";
import { registerStockMovementsRoutes } from "./stock/stock-movements-route.js";
import { registerStockProductsRoute } from "./stock/stock-products-route.js";
import type { StockRouteOptions } from "./stock/stock-route-options.js";
import { registerChangesRoute } from "./sync/changes-route.js";
import { DrizzleRequestAdmission } from "./sync/drizzle-request-admission.js";
import { registerEventsRoute } from "./sync/events-route.js";

type WithoutClock<T> = Omit<T, "now">;

export interface BuildAppOptions<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT> {
  version: string;
  now: () => Date;
  errorReporting?: BackofficeErrorReporting;
  edgeOriginSecret: string;
  setupFastifyErrorHandler?: (app: FastifyInstance) => void;
  staticDir?: string | undefined;
  recovery?: WithoutClock<RecoveryRouteOptions<TQueryResult>>;
  session?: WithoutClock<SessionAuthenticateRouteOptions<TQueryResult>>;
  passkeys?: WithoutClock<PasskeysListRouteOptions<TQueryResult>>;
  users?: WithoutClock<UsersRouteOptions<TQueryResult>>;
  roles?: WithoutClock<RolesRouteOptions<TQueryResult>>;
  branchSettings?: WithoutClock<BranchSettingsRouteOptions<TQueryResult>>;
  issuerIdentification?: WithoutClock<IssuerIdentificationRouteOptions<TQueryResult>>;
  buyerIdentificationThresholds?: WithoutClock<
    BuyerIdentificationThresholdsRouteOptions<TQueryResult>
  >;
  fiscalAddresses?: WithoutClock<FiscalAddressesRouteOptions<TQueryResult>>;
  categories?: WithoutClock<CategoriesRouteOptions<TQueryResult>>;
  brands?: WithoutClock<BrandsRouteOptions<TQueryResult>>;
  tags?: WithoutClock<TagsRouteOptions<TQueryResult>>;
  products?: WithoutClock<ProductsRouteOptions<TQueryResult>>;
  alerts?: WithoutClock<AlertsRouteOptions<TQueryResult>>;
  prices?: WithoutClock<PricesRouteOptions<TQueryResult>>;
  discounts?: WithoutClock<DiscountsRouteOptions<TQueryResult>>;
  registers?: WithoutClock<RegistersRouteOptions<TQueryResult>>;
  registersPointsOfSale?: WithoutClock<RegistersPointsOfSaleRouteOptions<TQueryResult>>;
  stock?: WithoutClock<StockRouteOptions<TQueryResult>>;
  devices?: WithoutClock<DeviceTokensOptions<TQueryResult>>;
  firstPinCodes?: WithoutClock<FirstPinCodeRouteOptions<TQueryResult>>;
}

type DatabaseRouteOptions<TQueryResult extends PgQueryResultHKT> = Required<
  Omit<
    BuildAppOptions<TQueryResult>,
    | "version"
    | "now"
    | "errorReporting"
    | "edgeOriginSecret"
    | "setupFastifyErrorHandler"
    | "staticDir"
  >
>;

interface DatabaseWiring<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  recoveryJobQueue: RecoveryJobQueue;
  authorizedCuit: string;
  deviceTokenRotationKey: Uint8Array;
  installationKeysEncryptionKey: Uint8Array;
}

export function databaseRouteOptions<TQueryResult extends PgQueryResultHKT>(
  wiring: DatabaseWiring<TQueryResult>,
): DatabaseRouteOptions<TQueryResult> {
  const { db, backofficeOrigin } = wiring;
  const backoffice = { db, backofficeOrigin };
  const devices = {
    db,
    rotationKey: wiring.deviceTokenRotationKey,
    keysEncryptionKey: wiring.installationKeysEncryptionKey,
  };
  return {
    recovery: { ...backoffice, jobQueue: wiring.recoveryJobQueue },
    session: backoffice,
    passkeys: backoffice,
    users: backoffice,
    roles: backoffice,
    branchSettings: backoffice,
    issuerIdentification: { ...backoffice, authorizedCuit: wiring.authorizedCuit },
    buyerIdentificationThresholds: backoffice,
    fiscalAddresses: backoffice,
    categories: backoffice,
    brands: backoffice,
    tags: backoffice,
    products: backoffice,
    alerts: backoffice,
    prices: backoffice,
    discounts: backoffice,
    registers: backoffice,
    registersPointsOfSale: backoffice,
    stock: backoffice,
    devices,
    firstPinCodes: devices,
  };
}

const API_PREFIX = "/api";
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

  const { now } = options;
  app.register(
    async (api) => {
      const devices = options.devices && { ...options.devices, now };
      registerHealthRoute(api, {
        version: options.version,
        ...(devices && {
          authenticateDevice: (authorization) =>
            authenticateDevice(installationTokenPorts(devices), authorization),
          admitRequest: (deviceId) =>
            admitInstallationRequest(
              { admission: new DrizzleRequestAdmission(devices.db), clock: { now } },
              { deviceId, endpoint: "health_check" },
            ),
        }),
      });

      const errorReporting: ErrorReportingConfiguration = options.errorReporting
        ? { enabled: true, ...options.errorReporting, release: options.version }
        : { enabled: false };
      api.get(
        "/error-reporting",
        { config: { access: PUBLIC_ACCESS } },
        async () => errorReporting,
      );

      if (options.recovery) {
        registerRecoveryRoutes(api, { ...options.recovery, now });
        registerRecoveryRedemptionRoutes(api, { ...options.recovery, now });
      }

      if (options.session) {
        registerSessionAuthenticationOptionsRoute(api, { ...options.session, now });
        registerSessionAuthenticateRoute(api, { ...options.session, now });
        registerSessionReadRoute(api, { ...options.session, now });
        registerSessionStatusRoute(api, { ...options.session, now });
        registerSessionSignOutRoute(api, { ...options.session, now });
        registerSessionAuthorizationRoutes(api, { ...options.session, now });
      }

      if (options.passkeys) {
        registerPasskeysListRoute(api, { ...options.passkeys, now });
        registerPasskeyRegistrationRoutes(api, { ...options.passkeys, now });
        registerPasskeyRemovalRoutes(api, { ...options.passkeys, now });
      }

      if (options.users) {
        registerUsersListRoute(api, { ...options.users, now });
        registerUserReadRoute(api, { ...options.users, now });
        registerUserCreationRoutes(api, { ...options.users, now });
        registerUserEditRoutes(api, { ...options.users, now });
        registerUserPasskeysListRoute(api, { ...options.users, now });
        registerUserPasskeyRemovalRoutes(api, { ...options.users, now });
        registerUserDeactivationRoutes(api, { ...options.users, now });
        registerUserPinCodeRoutes(api, { ...options.users, now });
        registerUserReactivationRoutes(api, { ...options.users, now });
      }

      if (options.roles) {
        registerRolesListRoute(api, { ...options.roles, now });
        registerPermissionCatalogRoute(api, { ...options.roles, now });
        registerRoleReadRoute(api, { ...options.roles, now });
        registerRoleCreationRoutes(api, { ...options.roles, now });
        registerRoleEditRoutes(api, { ...options.roles, now });
      }

      if (options.branchSettings) {
        registerBranchSettingsReadRoute(api, { ...options.branchSettings, now });
        registerBranchSettingsEditRoute(api, { ...options.branchSettings, now });
      }

      if (options.issuerIdentification) {
        registerIssuerIdentificationReadRoute(api, { ...options.issuerIdentification, now });
        registerIssuerIdentificationEditRoute(api, { ...options.issuerIdentification, now });
      }

      if (options.buyerIdentificationThresholds) {
        registerBuyerIdentificationThresholdsListRoute(api, {
          ...options.buyerIdentificationThresholds,
          now,
        });
        registerBuyerIdentificationThresholdRecordRoute(api, {
          ...options.buyerIdentificationThresholds,
          now,
        });
      }

      if (options.fiscalAddresses) {
        registerFiscalAddressesListRoute(api, { ...options.fiscalAddresses, now });
        registerFiscalAddressCreationRoute(api, { ...options.fiscalAddresses, now });
        registerFiscalAddressEditRoute(api, { ...options.fiscalAddresses, now });
      }

      if (options.categories) {
        registerCategoriesListRoute(api, { ...options.categories, now });
        registerCategoryCreationRoute(api, { ...options.categories, now });
        registerCategoryEditRoute(api, { ...options.categories, now });
      }

      if (options.brands) {
        registerBrandsListRoute(api, { ...options.brands, now });
        registerBrandCreationRoute(api, { ...options.brands, now });
        registerBrandEditRoute(api, { ...options.brands, now });
        registerBrandDeactivationRoute(api, { ...options.brands, now });
        registerBrandReactivationRoute(api, { ...options.brands, now });
      }

      if (options.tags) {
        registerTagsListRoute(api, { ...options.tags, now });
        registerTagCreationRoute(api, { ...options.tags, now });
        registerTagEditRoute(api, { ...options.tags, now });
        registerTagDeactivationRoute(api, { ...options.tags, now });
        registerTagReactivationRoute(api, { ...options.tags, now });
      }

      if (options.products) {
        registerProductsListRoute(api, { ...options.products, now });
        registerProductCreationRoute(api, { ...options.products, now });
        registerProductEditRoute(api, { ...options.products, now });
        registerProductDeactivationRoute(api, { ...options.products, now });
        registerInternalBarcodeRoute(api, { ...options.products, now });
        registerProductLabelsRoute(api, { ...options.products, now });
      }

      if (options.alerts) {
        registerAlertsListRoute(api, { ...options.alerts, now });
        registerAlertsOverviewRoute(api, { ...options.alerts, now });
        registerAlertReadRoute(api, { ...options.alerts, now });
        registerAlertCloseRoute(api, { ...options.alerts, now });
      }

      if (options.prices) {
        registerPricesListRoute(api, { ...options.prices, now });
        registerPriceSetRoute(api, { ...options.prices, now });
        registerPriceConfirmationRoute(api, { ...options.prices, now });
      }

      if (options.discounts) {
        registerDiscountsListRoute(api, { ...options.discounts, now });
        registerDiscountCreationRoute(api, { ...options.discounts, now });
        registerDiscountEditRoute(api, { ...options.discounts, now });
        registerDiscountTargetsRoute(api, { ...options.discounts, now });
      }

      if (options.stock) {
        registerStockBalancesRoute(api, { ...options.stock, now });
        registerStockProductsRoute(api, { ...options.stock, now });
        registerStockCountsRoutes(api, { ...options.stock, now });
        registerStockMovementsRoutes(api, { ...options.stock, now });
      }

      if (options.registers) {
        registerRegistersListRoute(api, { ...options.registers, now });
        registerRegisterCreationRoute(api, { ...options.registers, now });
        registerRegisterCoverageRoute(api, { ...options.registers, now });
        registerRegisterEnrollmentCodeRoute(api, { ...options.registers, now });
      }

      if (options.registersPointsOfSale) {
        registerRegistersPointsOfSaleListRoute(api, { ...options.registersPointsOfSale, now });
        registerRegisterPointOfSaleConfigurationRoute(api, {
          ...options.registersPointsOfSale,
          now,
        });
      }

      if (options.devices) {
        registerDeviceEnrollmentRoute(api, { ...options.devices, now });
        registerChangesRoute(api, { ...options.devices, now });
        registerEventsRoute(api, { ...options.devices, now });
        registerPinCodeRedemptionRoute(api, { ...options.devices, now });
        registerSignInLookupRoute(api, { ...options.devices, now });
        registerDeviceTokenRotationRoute(api, { ...options.devices, now });
      }

      if (options.firstPinCodes) {
        registerFirstPinCodeRoute(api, { ...options.firstPinCodes, now });
      }
    },
    { prefix: API_PREFIX },
  );

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
      const { pathname } = new URL(request.url, "http://localhost");
      const isClientRoute =
        extname(pathname) === "" &&
        pathname !== API_PREFIX &&
        !pathname.startsWith(`${API_PREFIX}/`);
      if ((request.method !== "GET" && request.method !== "HEAD") || !isClientRoute) {
        reply.code(404).send();
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
