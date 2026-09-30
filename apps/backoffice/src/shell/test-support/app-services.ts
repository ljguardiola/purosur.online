import { vi } from "vitest";
import { openSession } from "../../access/test-support/open-session";
import type { AppServices } from "../app";

export function createAppServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    fetchSession: vi.fn().mockResolvedValue(openSession()),
    checkSessionStatus: vi.fn().mockReturnValue(new Promise(() => {})),
    signInScreen: {
      fetchAuthenticationOptions: vi.fn(),
      authenticate: vi.fn(),
      startAuthentication: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    accountRecoveryScreen: { requestRecoveryLink: vi.fn() },
    registerPasskeyScreen: {
      fetchRegistrationOptions: vi.fn().mockReturnValue(new Promise(() => {})),
      redeemRecovery: vi.fn(),
      startRegistration: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    myAccountScreen: {
      fetchPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchPasskeyRegistrationChallenge: vi.fn(),
      registerPasskey: vi.fn(),
      removePasskey: vi.fn(),
      emitUserPinCode: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
      startRegistration: vi.fn(),
      signalUnknownCredential: vi.fn(),
    },
    usersListScreen: {
      fetchUsers: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      createUser: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    rolesListScreen: {
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      roleEditorModal: {
        fetchRole: vi.fn().mockReturnValue(new Promise(() => {})),
        createRole: vi.fn(),
        editRole: vi.fn(),
        fetchSessionAuthorizationOptions: vi.fn(),
        authorizeSession: vi.fn(),
        startAuthentication: vi.fn(),
      },
    },
    categoriesListScreen: {
      fetchCategories: vi.fn().mockReturnValue(new Promise(() => {})),
      createCategory: vi.fn(),
      editCategory: vi.fn(),
    },
    brandsListScreen: {
      fetchBrands: vi.fn().mockReturnValue(new Promise(() => {})),
      createBrand: vi.fn(),
      editBrand: vi.fn(),
      deactivateBrand: vi.fn(),
      reactivateBrand: vi.fn(),
    },
    tagsListScreen: {
      fetchTags: vi.fn().mockReturnValue(new Promise(() => {})),
      createTag: vi.fn(),
      editTag: vi.fn(),
      deactivateTag: vi.fn(),
      reactivateTag: vi.fn(),
    },
    productsListScreen: {
      fetchProducts: vi.fn().mockReturnValue(new Promise(() => {})),
      createProduct: vi.fn(),
      editProduct: vi.fn(),
      deactivateProduct: vi.fn(),
      fetchCategories: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchBrands: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
      fetchTags: vi
        .fn()
        .mockResolvedValue({ kind: "ok", value: { tags: [], taggedProductCount: 0 } }),
      createBrand: vi.fn(),
      createTag: vi.fn(),
      generateInternalBarcode: vi.fn(),
      printLabels: vi.fn(),
    },
    pricesListScreen: {
      fetchPrices: vi.fn().mockReturnValue(new Promise(() => {})),
      setPrice: vi.fn(),
      confirmPrice: vi.fn(),
    },
    discountsListScreen: {
      fetchDiscounts: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchDiscountTargets: vi
        .fn()
        .mockResolvedValue({ kind: "ok", value: { products: [], categories: [], tags: [] } }),
      createDiscount: vi.fn(),
      editDiscount: vi.fn(),
    },
    stockBalancesScreen: {
      fetchStockBalances: vi.fn().mockReturnValue(new Promise(() => {})),
    },
    stockCountsScreen: {
      fetchStockCounts: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchStockProducts: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchExpectedBalance: vi.fn().mockReturnValue(new Promise(() => {})),
      registerCount: vi.fn(),
    },
    stockMovementsScreen: {
      fetchStockMovements: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchStockProducts: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchStockBalances: vi.fn().mockReturnValue(new Promise(() => {})),
      recordLoss: vi.fn(),
      recordAdjustment: vi.fn(),
    },
    userDetailScreen: {
      fetchUser: vi.fn().mockReturnValue(new Promise(() => {})),
      editUser: vi.fn(),
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchUserPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
      removeUserPasskey: vi.fn(),
      deactivateUser: vi.fn(),
      reactivateUser: vi.fn(),
      emitUserPinCode: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    registersListScreen: {
      fetchRegisters: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchRegisterCoverage: vi.fn().mockReturnValue(new Promise(() => {})),
      createRegister: vi.fn(),
      emitEnrollmentCode: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    branchSettingsScreen: {
      fetchBranchSettings: vi.fn().mockReturnValue(new Promise(() => {})),
      saveBranchSettings: vi.fn(),
    },
    fiscalConfigurationScreen: {
      fetchIssuerIdentification: vi.fn().mockReturnValue(new Promise(() => {})),
      saveIssuerIdentification: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    accountFooter: { signOut: vi.fn().mockResolvedValue({ kind: "ok" }) },
    screenFailure: { isOnline: vi.fn(), reloadPage: vi.fn() },
    alertsOverviewScreen: {
      fetchAlertsOverview: vi.fn().mockReturnValue(new Promise(() => {})),
    },
    alertsListScreen: {
      fetchAlerts: vi.fn().mockReturnValue(new Promise(() => {})),
      alertDetailModal: {
        fetchAlert: vi.fn().mockReturnValue(new Promise(() => {})),
        closeAlert: vi.fn(),
      },
    },
    ...overrides,
  };
}
