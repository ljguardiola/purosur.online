import {
  isInternalBarcode,
  isPermissionKey,
  isValidDiscountPercent,
  isValidDiscountWeekdays,
  PRODUCT_NAME_MAX_LENGTH,
  SALE_UNITS,
  type SaleUnit,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_ADMINISTRATOR,
  SAMPLE_BRANCH_SETTINGS,
  SAMPLE_CATEGORY_TREE,
  SAMPLE_DISCOUNTS,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  SAMPLE_TAGS,
  sampleDiscountWindow,
  sampleEmail,
} from "./sample-catalog.js";

interface FlatProduct {
  topName: string;
  midName: string;
  leafName: string;
  name: string;
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: string } | null;
  barcode: { kind: "manufacturer"; code: string } | { kind: "internal" };
  active: boolean;
  unitPriceCents: number;
  pricePlan: "current" | "due_for_review";
  tagNames: readonly string[];
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

  it("never plans a product name longer than the domain's maximum", () => {
    for (const product of flattenProducts()) {
      expect(product.name.length).toBeLessThanOrEqual(PRODUCT_NAME_MAX_LENGTH);
    }
  });

  it("plans at least one name long enough that a screen must cut it short", () => {
    const longest = Math.max(...flattenProducts().map((product) => product.name.length));
    expect(longest).toBeGreaterThanOrEqual(90);
  });

  it("plans every sale unit the domain defines", () => {
    const saleUnits = new Set(flattenProducts().map((product) => product.saleUnit));
    expect(saleUnits).toEqual(new Set(SALE_UNITS));
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

  it("plans only whole-cent prices", () => {
    for (const product of flattenProducts()) {
      expect(Number.isInteger(product.unitPriceCents)).toBe(true);
    }
  });

  it("prices every product sold by the unit between ARS 800 and ARS 25,000", () => {
    for (const product of flattenProducts().filter((entry) => entry.saleUnit === "UNIT")) {
      expect(product.unitPriceCents).toBeGreaterThanOrEqual(80_000);
      expect(product.unitPriceCents).toBeLessThanOrEqual(2_500_000);
    }
  });

  it("prices every product sold by weight between ARS 3,000 and ARS 30,000 per kilogram", () => {
    for (const product of flattenProducts().filter((entry) => entry.saleUnit === "KG")) {
      expect(product.unitPriceCents).toBeGreaterThanOrEqual(300_000);
      expect(product.unitPriceCents).toBeLessThanOrEqual(3_000_000);
    }
  });
});

describe("SAMPLE_TAGS", () => {
  it("names every tag uniquely ignoring letter case", () => {
    const names = SAMPLE_TAGS.map((tag) => tag.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("plans both active and deactivated tags", () => {
    expect(new Set(SAMPLE_TAGS.map((tag) => tag.active))).toEqual(new Set([true, false]));
  });

  it("plans only tags the tag list defines on each product, never repeating one on a product", () => {
    const known = new Set(SAMPLE_TAGS.map((tag) => tag.name));
    for (const product of flattenProducts()) {
      expect(product.tagNames.every((name) => known.has(name))).toBe(true);
      expect(new Set(product.tagNames).size).toBe(product.tagNames.length);
    }
  });

  it("plans products with no tag, with one and with several", () => {
    const counts = new Set(
      flattenProducts().map((product) => Math.min(product.tagNames.length, 2)),
    );
    expect(counts).toEqual(new Set([0, 1, 2]));
  });

  it("puts every tag on at least one product, the deactivated ones too", () => {
    const used = new Set(flattenProducts().flatMap((product) => product.tagNames));
    expect(used).toEqual(new Set(SAMPLE_TAGS.map((tag) => tag.name)));
  });
});

describe("SAMPLE_DISCOUNTS", () => {
  it("names every discount uniquely", () => {
    const names = SAMPLE_DISCOUNTS.map((discount) => discount.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("plans a valid percent and valid weekdays for every discount", () => {
    for (const discount of SAMPLE_DISCOUNTS) {
      expect(isValidDiscountPercent(discount.percent)).toBe(true);
      expect(isValidDiscountWeekdays(discount.weekdays)).toBe(true);
    }
  });

  it("aims at a category, a product and a tag, and at least one discount on some weekdays only", () => {
    expect(new Set(SAMPLE_DISCOUNTS.map((discount) => discount.target.kind))).toEqual(
      new Set(["CATEGORY", "PRODUCT", "TAG"]),
    );
    expect(SAMPLE_DISCOUNTS.some((discount) => discount.weekdays.length > 0)).toBe(true);
  });

  it("aims only at sample categories, active sample products and active sample tags", () => {
    const categoryNames = new Set(
      SAMPLE_CATEGORY_TREE.flatMap((top) => [
        top.name,
        ...top.mids.flatMap((mid) => [mid.name, ...mid.leaves.map((leaf) => leaf.name)]),
      ]),
    );
    const activeProductNames = new Set(
      flattenProducts()
        .filter((product) => product.active)
        .map((product) => product.name),
    );
    const activeTagNames = new Set(SAMPLE_TAGS.filter((tag) => tag.active).map((tag) => tag.name));
    const namesByKind = {
      CATEGORY: categoryNames,
      PRODUCT: activeProductNames,
      TAG: activeTagNames,
    };

    for (const discount of SAMPLE_DISCOUNTS) {
      expect(namesByKind[discount.target.kind].has(discount.target.name)).toBe(true);
    }
  });

  it("plans some discounts running on the load day and some starting after it", () => {
    const loadDay = "2026-03-15";
    const windows = SAMPLE_DISCOUNTS.map((discount) => sampleDiscountWindow(discount, loadDay));

    expect(
      windows.some(({ validFrom, validTo }) => validFrom <= loadDay && loadDay <= validTo),
    ).toBe(true);
    expect(windows.some(({ validFrom }) => validFrom > loadDay)).toBe(true);
  });
});

describe("sampleDiscountWindow", () => {
  const plan = {
    name: "Verano",
    percent: 10,
    target: { kind: "TAG", name: "Vegano" },
    weekdays: [],
  } as const;

  it("starts the given number of days from the load day and lasts the given number of days, both ends included", () => {
    expect(
      sampleDiscountWindow({ ...plan, startsInDays: -3, lastsDays: 14 }, "2026-03-15"),
    ).toEqual({ validFrom: "2026-03-12", validTo: "2026-03-25" });
  });

  it("ends the day it starts when it lasts one day", () => {
    expect(sampleDiscountWindow({ ...plan, startsInDays: 0, lastsDays: 1 }, "2026-03-15")).toEqual({
      validFrom: "2026-03-15",
      validTo: "2026-03-15",
    });
  });

  it("counts across the end of a month and a year", () => {
    expect(
      sampleDiscountWindow({ ...plan, startsInDays: 10, lastsDays: 30 }, "2026-12-25"),
    ).toEqual({ validFrom: "2027-01-04", validTo: "2027-02-02" });
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

  it("uses a WhatsApp number in an Argentine area code that is never assigned", () => {
    expect(SAMPLE_BRANCH_SETTINGS.whatsappNumber).toMatch(/^\+54 9 10 /);
  });

  it("uses an Instagram handle with consecutive periods, which Instagram never registers", () => {
    expect(SAMPLE_BRANCH_SETTINGS.instagramHandle).toMatch(/^@[a-z.]*\.\.[a-z.]*$/);
  });
});

describe("SAMPLE_ADMINISTRATOR", () => {
  it("uses an email in the sample domain", () => {
    expect(SAMPLE_ADMINISTRATOR.email.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)).toBe(true);
  });
});

describe("SAMPLE_LOCKOUT_SOURCE_ADDRESSES", () => {
  it("names only addresses in the documentation-only blocks", () => {
    const documentationBlocks = ["192.0.2.", "198.51.100.", "203.0.113."];
    for (const address of Object.values(SAMPLE_LOCKOUT_SOURCE_ADDRESSES)) {
      expect(documentationBlocks.some((block) => address.startsWith(block))).toBe(true);
    }
  });
});

describe("the sample catalog", () => {
  it("never carries a CUIT-shaped number", () => {
    const everySampleValue = JSON.stringify([
      SAMPLE_ADMINISTRATOR,
      SAMPLE_BRANCH_SETTINGS,
      SAMPLE_CATEGORY_TREE,
      SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
      SAMPLE_REGISTER_NAMES,
      SAMPLE_ROLES,
    ]);
    expect(everySampleValue).not.toMatch(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/);
  });
});
