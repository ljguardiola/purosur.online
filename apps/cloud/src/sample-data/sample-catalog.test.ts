import { isInternalBarcode, isPermissionKey, PRODUCT_NAME_MAX_LENGTH } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_BRANCH_SETTINGS,
  SAMPLE_CATEGORY_TREE,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  sampleEmail,
} from "./sample-catalog.js";

interface FlatProduct {
  topName: string;
  midName: string;
  leafName: string;
  name: string;
  saleUnit: "UNIT" | "KG";
  netContent: { quantity: number; unit: string } | null;
  barcode: { kind: "manufacturer"; code: string } | { kind: "internal" };
  active: boolean;
  unitPriceCents: number;
  pricePlan: "current" | "due_for_review";
}

function flattenProducts(): FlatProduct[] {
  const flat: FlatProduct[] = [];
  for (const top of SAMPLE_CATEGORY_TREE) {
    for (const mid of top.mids) {
      for (const leaf of mid.leaves) {
        for (const product of leaf.products) {
          flat.push({ topName: top.name, midName: mid.name, leafName: leaf.name, ...product });
        }
      }
    }
  }
  return flat;
}

describe("SAMPLE_CATEGORY_TREE", () => {
  it("nests three levels deep: top, mid and leaf categories", () => {
    expect(SAMPLE_CATEGORY_TREE.length).toBeGreaterThan(0);
    for (const top of SAMPLE_CATEGORY_TREE) {
      expect(top.mids.length).toBeGreaterThan(0);
      for (const mid of top.mids) {
        expect(mid.leaves.length).toBeGreaterThan(0);
        for (const leaf of mid.leaves) {
          expect(leaf.products.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("names every category uniquely among its own siblings", () => {
    for (const top of SAMPLE_CATEGORY_TREE) {
      const midNames = top.mids.map((mid) => mid.name.toLowerCase());
      expect(new Set(midNames).size).toBe(midNames.length);
      for (const mid of top.mids) {
        const leafNames = mid.leaves.map((leaf) => leaf.name.toLowerCase());
        expect(new Set(leafNames).size).toBe(leafNames.length);
      }
    }
    const topNames = SAMPLE_CATEGORY_TREE.map((top) => top.name.toLowerCase());
    expect(new Set(topNames).size).toBe(topNames.length);
  });

  it("plans a few hundred products in total", () => {
    const total = flattenProducts().length;
    expect(total).toBeGreaterThanOrEqual(250);
    expect(total).toBeLessThanOrEqual(350);
  });

  it("never plans a product name longer than the contract's maximum", () => {
    for (const product of flattenProducts()) {
      expect(product.name.length).toBeLessThanOrEqual(PRODUCT_NAME_MAX_LENGTH);
    }
  });

  it("plans at least one name long enough that a screen must cut it short", () => {
    const longest = Math.max(...flattenProducts().map((product) => product.name.length));
    expect(longest).toBeGreaterThanOrEqual(90);
  });

  it("plans both sale units", () => {
    const saleUnits = new Set(flattenProducts().map((product) => product.saleUnit));
    expect(saleUnits).toEqual(new Set(["UNIT", "KG"]));
  });

  it("never plans net content for a product sold by weight", () => {
    for (const product of flattenProducts().filter((entry) => entry.saleUnit === "KG")) {
      expect(product.netContent).toBeNull();
    }
  });

  it("plans both active and inactive products", () => {
    const activeFlags = new Set(flattenProducts().map((product) => product.active));
    expect(activeFlags).toEqual(new Set([true, false]));
  });

  it("plans both manufacturer-style and internally allocated barcodes", () => {
    const kinds = new Set(flattenProducts().map((product) => product.barcode.kind));
    expect(kinds).toEqual(new Set(["manufacturer", "internal"]));
  });

  it("gives every manufacturer-style barcode a unique, well-formed EAN-13 code disjoint from the internal range", () => {
    const codes = flattenProducts()
      .map((product) => product.barcode)
      .filter((barcode): barcode is { kind: "manufacturer"; code: string } => {
        return barcode.kind === "manufacturer";
      })
      .map((barcode) => barcode.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^\d{13}$/);
      expect(isInternalBarcode(code)).toBe(false);
    }
  });

  it("plans both current and due-for-review prices", () => {
    const plans = new Set(flattenProducts().map((product) => product.pricePlan));
    expect(plans).toEqual(new Set(["current", "due_for_review"]));
  });

  it("plans only positive integer prices", () => {
    for (const product of flattenProducts()) {
      expect(Number.isInteger(product.unitPriceCents)).toBe(true);
      expect(product.unitPriceCents).toBeGreaterThan(0);
    }
  });
});

describe("SAMPLE_ROLES", () => {
  it("defines more than one role, each with only known, non-repeating permission keys", () => {
    expect(SAMPLE_ROLES.length).toBeGreaterThan(1);
    for (const role of SAMPLE_ROLES) {
      expect(role.permissionKeys.length).toBeGreaterThan(0);
      expect(role.permissionKeys.every(isPermissionKey)).toBe(true);
      expect(new Set(role.permissionKeys).size).toBe(role.permissionKeys.length);
    }
  });

  it("names every role uniquely and never names it after the Administrator role", () => {
    const names = SAMPLE_ROLES.map((role) => role.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("administrador");
  });

  it("plans at least one active and one inactive user for every role", () => {
    for (const role of SAMPLE_ROLES) {
      const activeFlags = new Set(role.users.map((user) => user.active));
      expect(activeFlags).toEqual(new Set([true, false]));
    }
  });

  it("gives every sample user a unique email in the sample domain", () => {
    const emails = SAMPLE_ROLES.flatMap((role) => role.users.map((user) => user.email));
    expect(emails.length).toBeGreaterThan(0);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) {
      expect(email.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)).toBe(true);
    }
  });
});

describe("sampleEmail", () => {
  it("appends the reserved sample domain to a local part", () => {
    expect(sampleEmail("cajera.muestra")).toBe(`cajera.muestra@${SAMPLE_EMAIL_DOMAIN}`);
  });
});

describe("SAMPLE_REGISTER_NAMES", () => {
  it("names a few registers uniquely", () => {
    expect(SAMPLE_REGISTER_NAMES.length).toBeGreaterThan(0);
    expect(new Set(SAMPLE_REGISTER_NAMES.map((name) => name.toLowerCase())).size).toBe(
      SAMPLE_REGISTER_NAMES.length,
    );
  });
});

describe("SAMPLE_BRANCH_SETTINGS", () => {
  it("closes on at least one day of the week", () => {
    const days = [
      SAMPLE_BRANCH_SETTINGS.mondayHours,
      SAMPLE_BRANCH_SETTINGS.tuesdayHours,
      SAMPLE_BRANCH_SETTINGS.wednesdayHours,
      SAMPLE_BRANCH_SETTINGS.thursdayHours,
      SAMPLE_BRANCH_SETTINGS.fridayHours,
      SAMPLE_BRANCH_SETTINGS.saturdayHours,
      SAMPLE_BRANCH_SETTINGS.sundayHours,
    ];
    expect(days.some((ranges) => ranges.length === 0)).toBe(true);
  });

  it("splits at least one day into more than one shift", () => {
    const days = [
      SAMPLE_BRANCH_SETTINGS.mondayHours,
      SAMPLE_BRANCH_SETTINGS.tuesdayHours,
      SAMPLE_BRANCH_SETTINGS.wednesdayHours,
      SAMPLE_BRANCH_SETTINGS.thursdayHours,
      SAMPLE_BRANCH_SETTINGS.fridayHours,
      SAMPLE_BRANCH_SETTINGS.saturdayHours,
      SAMPLE_BRANCH_SETTINGS.sundayHours,
    ];
    expect(days.some((ranges) => ranges.length > 1)).toBe(true);
  });

  it("closes every range later than it opens", () => {
    const days = [
      SAMPLE_BRANCH_SETTINGS.mondayHours,
      SAMPLE_BRANCH_SETTINGS.tuesdayHours,
      SAMPLE_BRANCH_SETTINGS.wednesdayHours,
      SAMPLE_BRANCH_SETTINGS.thursdayHours,
      SAMPLE_BRANCH_SETTINGS.fridayHours,
      SAMPLE_BRANCH_SETTINGS.saturdayHours,
      SAMPLE_BRANCH_SETTINGS.sundayHours,
    ];
    for (const ranges of days) {
      for (const range of ranges) {
        expect(range.closesAt > range.opensAt).toBe(true);
      }
    }
  });

  it("carries no real CUIT and only fictional contact details", () => {
    expect(SAMPLE_BRANCH_SETTINGS.address.length).toBeGreaterThan(0);
    expect(SAMPLE_BRANCH_SETTINGS.whatsappNumber.length).toBeGreaterThan(0);
    expect(SAMPLE_BRANCH_SETTINGS.instagramHandle.length).toBeGreaterThan(0);
  });
});
