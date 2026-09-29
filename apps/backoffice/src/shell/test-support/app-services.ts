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
    productsListScreen: {
      fetchProducts: vi.fn().mockReturnValue(new Promise(() => {})),
      createProduct: vi.fn(),
      editProduct: vi.fn(),
      deactivateProduct: vi.fn(),
      fetchCategories: vi.fn().mockReturnValue(new Promise(() => {})),
      generateInternalBarcode: vi.fn(),
      printLabels: vi.fn(),
    },
    pricesListScreen: {
      fetchPrices: vi.fn().mockReturnValue(new Promise(() => {})),
      setPrice: vi.fn(),
      confirmPrice: vi.fn(),
    },
    userDetailScreen: {
      fetchUser: vi.fn().mockReturnValue(new Promise(() => {})),
      editUser: vi.fn(),
      fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchUserPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
      removeUserPasskey: vi.fn(),
      deactivateUser: vi.fn(),
      reactivateUser: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    registersListScreen: {
      fetchRegisters: vi.fn().mockReturnValue(new Promise(() => {})),
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
