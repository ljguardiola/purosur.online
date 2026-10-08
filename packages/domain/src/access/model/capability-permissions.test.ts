import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  type Capability,
  grantedCapabilities,
  grantsCapability,
} from "./capability-permissions.js";
import { PERMISSION_KEYS, type PermissionKey } from "./permission-catalog.js";

const CAPABILITIES_GRANTED_BY: readonly [PermissionKey, readonly Capability[]][] = [
  ["deactivate_users", ["users_area", "deactivate_users"]],
  ["reactivate_users", ["users_area", "reactivate_users"]],
  ["reset_user_pin", ["users_area", "reset_user_pin"]],
  ["configure_branch", ["branch_area"]],
  ["manage_products_and_categories", ["products_and_categories", "catalog_area"]],
  ["manage_prices_and_review", ["prices_area", "catalog_area"]],
  ["manage_promotions", ["promotions", "catalog_area"]],
  ["change_fiscal_configuration", ["cash_area"]],
  ["view_branch_alerts", ["alerts_area"]],
  ["view_all_alerts", ["alerts_area"]],
  ["dismiss_alerts_manually", ["close_alerts_manually"]],
  ["enroll_register_devices", ["registers_area"]],
  ["view_stock_balances", ["stock_balances", "stock_area"]],
  ["perform_stock_counts", ["stock_counts", "stock_area"]],
  ["record_stock_losses", ["stock_losses", "stock_movements", "stock_area"]],
  ["adjust_stock", ["stock_adjustments", "stock_movements", "stock_area"]],
  ["view_reports", ["reports_area"]],
  ["confirm_refunds", ["refunds_area"]],
];

function inCapabilityOrder(capabilities: readonly Capability[]): Capability[] {
  return CAPABILITIES.filter((capability) => capabilities.includes(capability));
}

describe("grantsCapability", () => {
  it("grants every capability to an administrator, whatever it holds", () => {
    for (const capability of CAPABILITIES) {
      expect(grantsCapability({ isAdministrator: true, permissionKeys: [] }, capability)).toBe(
        true,
      );
    }
  });

  it("grants no capability to a role holding no permission", () => {
    for (const capability of CAPABILITIES) {
      expect(grantsCapability({ isAdministrator: false, permissionKeys: [] }, capability)).toBe(
        false,
      );
    }
  });

  it("grants no capability to a role holding only unrelated permissions", () => {
    const access = { isAdministrator: false, permissionKeys: ["sell_and_charge", "void_sale"] };

    for (const capability of CAPABILITIES) {
      expect(grantsCapability(access, capability)).toBe(false);
    }
  });

  it("grants a composite capability when any one of its permissions is held", () => {
    expect(
      grantsCapability({ isAdministrator: false, permissionKeys: ["adjust_stock"] }, "stock_area"),
    ).toBe(true);
    expect(
      grantsCapability(
        { isAdministrator: false, permissionKeys: ["adjust_stock"] },
        "stock_losses",
      ),
    ).toBe(false);
  });
});

describe("the reports_area capability", () => {
  it("is granted to whoever may view reports and to no one else", () => {
    expect(
      grantsCapability(
        { isAdministrator: false, permissionKeys: ["view_reports"] },
        "reports_area",
      ),
    ).toBe(true);
    expect(
      grantsCapability(
        {
          isAdministrator: false,
          permissionKeys: PERMISSION_KEYS.filter((key) => key !== "view_reports"),
        },
        "reports_area",
      ),
    ).toBe(false);
  });
});

describe.each(["manage_users", "manage_roles"] as const)("the %s capability", (capability) => {
  it("is granted to an administrator holding no permission", () => {
    expect(grantsCapability({ isAdministrator: true, permissionKeys: [] }, capability)).toBe(true);
  });

  it("is granted to no one who is not an administrator, whatever permission is held", () => {
    for (const key of PERMISSION_KEYS) {
      expect(grantsCapability({ isAdministrator: false, permissionKeys: [key] }, capability)).toBe(
        false,
      );
    }
    expect(
      grantsCapability({ isAdministrator: false, permissionKeys: PERMISSION_KEYS }, capability),
    ).toBe(false);
  });
});

describe("grantedCapabilities", () => {
  it("lists every capability for an administrator", () => {
    expect(grantedCapabilities({ isAdministrator: true, permissionKeys: [] })).toEqual([
      ...CAPABILITIES,
    ]);
  });

  it("lists none for a role holding no permission", () => {
    expect(grantedCapabilities({ isAdministrator: false, permissionKeys: [] })).toEqual([]);
  });

  it("lists none for a role holding only unrelated permissions", () => {
    expect(
      grantedCapabilities({
        isAdministrator: false,
        permissionKeys: ["sell_and_charge", "reprint_receipt", "manage_suppliers"],
      }),
    ).toEqual([]);
  });

  it.each(CAPABILITIES_GRANTED_BY)("lists exactly what %s grants", (permission, expected) => {
    expect(grantedCapabilities({ isAdministrator: false, permissionKeys: [permission] })).toEqual(
      inCapabilityOrder(expected),
    );
  });

  it("lists the union of what each held permission grants, once each", () => {
    expect(
      grantedCapabilities({
        isAdministrator: false,
        permissionKeys: ["view_branch_alerts", "view_all_alerts", "configure_branch"],
      }),
    ).toEqual(inCapabilityOrder(["alerts_area", "branch_area"]));
  });

  it("agrees with grantsCapability for every capability", () => {
    const access = {
      isAdministrator: false,
      permissionKeys: ["record_stock_losses", "manage_promotions", "reset_user_pin"],
    };

    expect(grantedCapabilities(access)).toEqual(
      CAPABILITIES.filter((capability) => grantsCapability(access, capability)),
    );
  });
});
