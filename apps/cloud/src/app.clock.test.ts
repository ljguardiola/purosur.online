import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import { describe, expectTypeOf, it } from "vitest";
import type { AlertsRouteOptions } from "./alerts/alerts-list-route.js";
import type { BuildAppOptions } from "./app.js";
import type { BranchSettingsRouteOptions } from "./branch/branch-settings-read-route.js";
import type { BrandsRouteOptions } from "./catalog/brands-list-route.js";
import type { CategoriesRouteOptions } from "./catalog/categories-list-route.js";
import type { ProductsRouteOptions } from "./catalog/products-list-route.js";
import type { TagsRouteOptions } from "./catalog/tags-list-route.js";
import type { PasskeysListRouteOptions } from "./credentials/passkeys-list-route.js";
import type { PasskeyRegistrationRouteOptions } from "./credentials/passkeys-registration-route.js";
import type { PasskeyRemovalRouteOptions } from "./credentials/passkeys-removal-route.js";
import type { RecoveryRedemptionRouteOptions } from "./credentials/recovery-redemption-route.js";
import type { RecoveryRouteOptions } from "./credentials/request-recovery-route.js";
import type { SessionAuthenticateRouteOptions } from "./credentials/session-authenticate-route.js";
import type { SessionAuthenticationOptionsRouteOptions } from "./credentials/session-authentication-options-route.js";
import type { SessionAuthorizationRouteOptions } from "./credentials/session-authorization-route.js";
import type { BuyerIdentificationThresholdsRouteOptions } from "./fiscal/buyer-identification-thresholds-list-route.js";
import type { FiscalAddressesRouteOptions } from "./fiscal/fiscal-addresses-list-route.js";
import type { IssuerIdentificationRouteOptions } from "./fiscal/issuer-identification-read-route.js";
import type { RegistersPointsOfSaleRouteOptions } from "./fiscal/registers-points-of-sale-list-route.js";
import type { RolesRouteOptions } from "./permissions/roles-list-route.js";
import type { DiscountsRouteOptions } from "./pricing/discounts-list-route.js";
import type { PricesRouteOptions } from "./pricing/prices-list-route.js";
import type { DeviceEnrollmentRouteOptions } from "./register/device-enrollment-route.js";
import type { RegistersRouteOptions } from "./register/registers-list-route.js";
import type { SessionReadRouteOptions } from "./sessions/session-read-route.js";
import type { SessionSignOutRouteOptions } from "./sessions/session-sign-out-route.js";
import type { SessionStatusRouteOptions } from "./sessions/session-status-route.js";
import type { StockRouteOptions } from "./stock/stock-route-options.js";
import type { UsersRouteOptions } from "./users/users-list-route.js";

type WithoutClock<Options> = Omit<Options, "now">;

describe("the clock every route is handed", () => {
  it("is required to build the app", () => {
    expectTypeOf<WithoutClock<BuildAppOptions>>().not.toExtend<BuildAppOptions>();
  });

  it("is required by the passkeys list route", () => {
    expectTypeOf<WithoutClock<PasskeysListRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      PasskeysListRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the passkeys registration route", () => {
    expectTypeOf<WithoutClock<PasskeyRegistrationRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      PasskeyRegistrationRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the passkeys removal route", () => {
    expectTypeOf<WithoutClock<PasskeyRemovalRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      PasskeyRemovalRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the recovery redemption route", () => {
    expectTypeOf<WithoutClock<RecoveryRedemptionRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      RecoveryRedemptionRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the request recovery route", () => {
    expectTypeOf<WithoutClock<RecoveryRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      RecoveryRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the roles routes", () => {
    expectTypeOf<WithoutClock<RolesRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      RolesRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the session authenticate route", () => {
    expectTypeOf<WithoutClock<SessionAuthenticateRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      SessionAuthenticateRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the session authentication options route", () => {
    expectTypeOf<
      WithoutClock<SessionAuthenticationOptionsRouteOptions<PgQueryResultHKT>>
    >().not.toExtend<SessionAuthenticationOptionsRouteOptions<PgQueryResultHKT>>();
  });

  it("is required by the session authorization route", () => {
    expectTypeOf<WithoutClock<SessionAuthorizationRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      SessionAuthorizationRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the session read route", () => {
    expectTypeOf<WithoutClock<SessionReadRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      SessionReadRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the session sign out route", () => {
    expectTypeOf<WithoutClock<SessionSignOutRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      SessionSignOutRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the session status route", () => {
    expectTypeOf<WithoutClock<SessionStatusRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      SessionStatusRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the users routes", () => {
    expectTypeOf<WithoutClock<UsersRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      UsersRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the alerts routes", () => {
    expectTypeOf<WithoutClock<AlertsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      AlertsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the branch settings routes", () => {
    expectTypeOf<WithoutClock<BranchSettingsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      BranchSettingsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the brands routes", () => {
    expectTypeOf<WithoutClock<BrandsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      BrandsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the categories routes", () => {
    expectTypeOf<WithoutClock<CategoriesRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      CategoriesRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the products routes", () => {
    expectTypeOf<WithoutClock<ProductsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      ProductsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the tags routes", () => {
    expectTypeOf<WithoutClock<TagsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      TagsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the buyer identification thresholds routes", () => {
    expectTypeOf<
      WithoutClock<BuyerIdentificationThresholdsRouteOptions<PgQueryResultHKT>>
    >().not.toExtend<BuyerIdentificationThresholdsRouteOptions<PgQueryResultHKT>>();
  });

  it("is required by the fiscal addresses routes", () => {
    expectTypeOf<WithoutClock<FiscalAddressesRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      FiscalAddressesRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the issuer identification routes", () => {
    expectTypeOf<WithoutClock<IssuerIdentificationRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      IssuerIdentificationRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the registers points of sale routes", () => {
    expectTypeOf<WithoutClock<RegistersPointsOfSaleRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      RegistersPointsOfSaleRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the discounts routes", () => {
    expectTypeOf<WithoutClock<DiscountsRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      DiscountsRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the prices routes", () => {
    expectTypeOf<WithoutClock<PricesRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      PricesRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the device enrollment route", () => {
    expectTypeOf<WithoutClock<DeviceEnrollmentRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      DeviceEnrollmentRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the registers routes", () => {
    expectTypeOf<WithoutClock<RegistersRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      RegistersRouteOptions<PgQueryResultHKT>
    >();
  });

  it("is required by the stock routes", () => {
    expectTypeOf<WithoutClock<StockRouteOptions<PgQueryResultHKT>>>().not.toExtend<
      StockRouteOptions<PgQueryResultHKT>
    >();
  });
});
