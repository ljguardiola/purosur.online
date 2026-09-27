import { describe, expect, it } from "vitest";
import {
  ALERT_VIEW_PERMISSION_KEYS,
  isPermissionKey,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
} from "./permission-catalog.js";

const AREA_ORDER_WITH_COUNTS: readonly [string, number][] = [
  ["cashRegister", 7],
  ["sale", 3],
  ["returns", 2],
  ["checkout", 1],
  ["stock", 5],
  ["purchasing", 9],
  ["catalog", 3],
  ["assembledProducts", 2],
  ["users", 3],
  ["fiscal", 4],
  ["reports", 1],
  ["alerts", 3],
  ["devices", 3],
  ["backups", 2],
  ["branch", 1],
];

describe("PERMISSION_CATALOG", () => {
  it("holds exactly 49 permissions", () => {
    expect(PERMISSION_CATALOG).toHaveLength(49);
  });

  it("has a unique key for every permission", () => {
    const keys = PERMISSION_CATALOG.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("exports PERMISSION_KEYS matching the catalog's own keys, in order", () => {
    expect(PERMISSION_KEYS).toEqual(PERMISSION_CATALOG.map((permission) => permission.key));
  });

  it("groups permissions by area in the exact drawn order, with the drawn count per area", () => {
    const areasInOrder: string[] = [];
    const countByArea = new Map<string, number>();
    for (const permission of PERMISSION_CATALOG) {
      if (!areasInOrder.includes(permission.area)) {
        areasInOrder.push(permission.area);
      }
      countByArea.set(permission.area, (countByArea.get(permission.area) ?? 0) + 1);
    }

    expect(areasInOrder).toEqual(AREA_ORDER_WITH_COUNTS.map(([area]) => area));
    for (const [area, count] of AREA_ORDER_WITH_COUNTS) {
      expect(countByArea.get(area), `area ${area}`).toBe(count);
    }
  });

  it("marks exactly the four register-only permissions with the register marker", () => {
    const registerOnly = PERMISSION_CATALOG.filter(
      (permission) => permission.registerMarker === "register",
    );
    expect(registerOnly).toHaveLength(4);
  });

  it("marks exactly the eleven permissions requiring another person's register PIN", () => {
    const pinPermissions = PERMISSION_CATALOG.filter(
      (permission) => permission.registerMarker === "register_with_another_persons_pin",
    );
    expect(pinPermissions).toHaveLength(11);
  });

  it("leaves every remaining permission with no register marker", () => {
    const none = PERMISSION_CATALOG.filter((permission) => permission.registerMarker === "none");
    expect(none).toHaveLength(49 - 4 - 11);
  });

  it("exports PERMISSION_AREAS in the exact drawn area order, the role editor's areas pane order", () => {
    expect(PERMISSION_AREAS).toEqual(AREA_ORDER_WITH_COUNTS.map(([area]) => area));
  });

  it("exposes the two mutually exclusive alert-view permissions, both in the catalog", () => {
    expect(ALERT_VIEW_PERMISSION_KEYS).toHaveLength(2);
    const [first, second] = ALERT_VIEW_PERMISSION_KEYS;
    expect(first).not.toBe(second);
    expect(PERMISSION_KEYS).toContain(first);
    expect(PERMISSION_KEYS).toContain(second);
  });
});

describe("isPermissionKey", () => {
  it("accepts every key the catalog declares", () => {
    for (const key of PERMISSION_KEYS) {
      expect(isPermissionKey(key)).toBe(true);
    }
  });

  it("rejects a string that is not a catalog key", () => {
    expect(isPermissionKey("not_a_real_permission")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isPermissionKey(42)).toBe(false);
    expect(isPermissionKey(undefined)).toBe(false);
  });
});
