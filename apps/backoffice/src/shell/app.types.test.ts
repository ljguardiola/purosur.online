import { expectTypeOf, test } from "vitest";
import type { AccountRecoveryScreenProps } from "../access/account-recovery-screen";
import type { MyAccountScreenProps } from "../access/my-account-screen";
import type { RegisterPasskeyScreenProps } from "../access/register-passkey-screen";
import type { RolesListScreenProps } from "../access/roles-list-screen";
import type { SignInScreenProps } from "../access/sign-in-screen";
import type { UserDetailScreenProps } from "../access/user-detail-screen";
import type { UsersListScreenProps } from "../access/users-list-screen";
import type { AlertsListScreenProps } from "../alerts/alerts-list-screen";
import type { BranchSettingsScreenProps } from "../branch/branch-settings-screen";
import type { BrandsListScreenProps } from "../catalog/brands-list-screen";
import type { CategoriesListScreenProps } from "../catalog/categories-list-screen";
import type { ProductsListScreenProps } from "../catalog/products-list-screen";
import type { TagsListScreenProps } from "../catalog/tags-list-screen";
import type { FiscalConfigurationScreenProps } from "../fiscal/fiscal-configuration-screen";
import type { PricesListScreenProps } from "../pricing/prices-list-screen";
import type { RegistersListScreenProps } from "../register/registers-list-screen";
import type { AppServices } from "./app";

type ServicesProp<Props extends { services?: unknown }> = Pick<Props, "services">;

test("requires the services of every screen", () => {
  expectTypeOf<AppServices>().toEqualTypeOf<Required<AppServices>>();
});

test("makes every screen require its services", () => {
  expectTypeOf<ServicesProp<SignInScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<SignInScreenProps>>
  >();
  expectTypeOf<ServicesProp<AccountRecoveryScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<AccountRecoveryScreenProps>>
  >();
  expectTypeOf<ServicesProp<RegisterPasskeyScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<RegisterPasskeyScreenProps>>
  >();
  expectTypeOf<ServicesProp<MyAccountScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<MyAccountScreenProps>>
  >();
  expectTypeOf<ServicesProp<UsersListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<UsersListScreenProps>>
  >();
  expectTypeOf<ServicesProp<UserDetailScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<UserDetailScreenProps>>
  >();
  expectTypeOf<ServicesProp<RolesListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<RolesListScreenProps>>
  >();
  expectTypeOf<ServicesProp<RegistersListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<RegistersListScreenProps>>
  >();
  expectTypeOf<ServicesProp<BranchSettingsScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<BranchSettingsScreenProps>>
  >();
  expectTypeOf<ServicesProp<CategoriesListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<CategoriesListScreenProps>>
  >();
  expectTypeOf<ServicesProp<BrandsListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<BrandsListScreenProps>>
  >();
  expectTypeOf<ServicesProp<TagsListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<TagsListScreenProps>>
  >();
  expectTypeOf<ServicesProp<ProductsListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<ProductsListScreenProps>>
  >();
  expectTypeOf<ServicesProp<PricesListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<PricesListScreenProps>>
  >();
  expectTypeOf<ServicesProp<FiscalConfigurationScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<FiscalConfigurationScreenProps>>
  >();
  expectTypeOf<ServicesProp<AlertsListScreenProps>>().toEqualTypeOf<
    Required<ServicesProp<AlertsListScreenProps>>
  >();
});
