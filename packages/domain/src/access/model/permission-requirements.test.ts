import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, type PermissionKey } from "./permission-catalog.js";
import {
  closeUnderRequirements,
  lacksARequiredPermission,
  PERMISSION_REQUIREMENTS,
  permissionsRequiring,
  type RequirementMap,
  withRequiredPermissions,
} from "./permission-requirements.js";

const LETTERS = ["a", "b", "c", "d", "e", "f"] as const;
type Letter = (typeof LETTERS)[number];

const letterSet = fc.uniqueArray(fc.constantFrom(...LETTERS));

// Arbitrary maps include chains and cycles, which the real map does not hold yet.
const letterRequirements: fc.Arbitrary<RequirementMap<Letter>> = fc.dictionary(
  fc.constantFrom(...LETTERS),
  fc.uniqueArray(fc.constantFrom(...LETTERS)),
) as fc.Arbitrary<RequirementMap<Letter>>;

const permissionSet = fc.uniqueArray(fc.constantFrom(...PERMISSION_KEYS));

function everyRequirementHeld<Key extends string>(
  requirements: RequirementMap<Key>,
  keys: ReadonlySet<Key>,
): boolean {
  return [...keys].every((key) =>
    (requirements[key] ?? []).every((required) => keys.has(required)),
  );
}

describe("PERMISSION_REQUIREMENTS", () => {
  it("makes counting, adjusting and recording losses each require viewing stock balances", () => {
    expect(PERMISSION_REQUIREMENTS).toEqual({
      perform_stock_counts: ["view_stock_balances"],
      adjust_stock: ["view_stock_balances"],
      record_stock_losses: ["view_stock_balances"],
    });
  });

  it("names only catalog permissions, none of them requiring itself", () => {
    for (const [key, required] of Object.entries(PERMISSION_REQUIREMENTS)) {
      expect(PERMISSION_KEYS).toContain(key);
      for (const requiredKey of required) {
        expect(PERMISSION_KEYS).toContain(requiredKey);
        expect(requiredKey).not.toBe(key);
      }
    }
  });
});

describe("closeUnderRequirements", () => {
  it("adds what a chain of requirements reaches, and keeps what it was given", () => {
    const requirements: RequirementMap<Letter> = { a: ["b"], b: ["c"], d: ["e"] };

    expect(closeUnderRequirements(requirements, ["a", "f"])).toEqual(new Set(["a", "f", "b", "c"]));
  });

  it("ends on a cycle of requirements", () => {
    const requirements: RequirementMap<Letter> = { a: ["b"], b: ["a"] };

    expect(closeUnderRequirements(requirements, ["a"])).toEqual(new Set(["a", "b"]));
  });

  it("returns a set that contains every requirement of each of its keys", () => {
    fc.assert(
      fc.property(letterRequirements, letterSet, (requirements, keys) => {
        expect(everyRequirementHeld(requirements, closeUnderRequirements(requirements, keys))).toBe(
          true,
        );
      }),
    );
  });

  it("keeps every key it was given", () => {
    fc.assert(
      fc.property(letterRequirements, letterSet, (requirements, keys) => {
        const closed = closeUnderRequirements(requirements, keys);
        for (const key of keys) {
          expect(closed.has(key)).toBe(true);
        }
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(letterRequirements, letterSet, (requirements, keys) => {
        const closed = closeUnderRequirements(requirements, keys);
        expect(closeUnderRequirements(requirements, closed)).toEqual(closed);
      }),
    );
  });

  it("adds nothing to a set that already holds every requirement of its keys", () => {
    fc.assert(
      fc.property(letterRequirements, letterSet, (requirements, keys) => {
        fc.pre(everyRequirementHeld(requirements, new Set(keys)));
        expect(closeUnderRequirements(requirements, keys)).toEqual(new Set(keys));
      }),
    );
  });
});

describe("withRequiredPermissions", () => {
  it("adds viewing stock balances to counting stock", () => {
    expect(withRequiredPermissions(["perform_stock_counts"])).toEqual(
      new Set(["perform_stock_counts", "view_stock_balances"]),
    );
  });

  it("leaves a set of permissions without requirements as it is", () => {
    expect(withRequiredPermissions(["sell_and_charge", "view_reports"])).toEqual(
      new Set(["sell_and_charge", "view_reports"]),
    );
  });

  it("returns a set that contains every requirement of each of its permissions, idempotently", () => {
    fc.assert(
      fc.property(permissionSet, (keys) => {
        const closed = withRequiredPermissions(keys);
        expect(everyRequirementHeld(PERMISSION_REQUIREMENTS, closed)).toBe(true);
        expect(withRequiredPermissions(closed)).toEqual(closed);
      }),
    );
  });
});

describe("lacksARequiredPermission", () => {
  it.each<[readonly string[]]>([
    [["record_stock_losses"]],
    [["adjust_stock", "sell_and_charge"]],
    [["perform_stock_counts", "record_stock_losses"]],
  ])("is true for %j, which leaves out viewing stock balances", (keys) => {
    expect(lacksARequiredPermission(keys)).toBe(true);
  });

  it.each<[readonly string[]]>([
    [[]],
    [["view_stock_balances"]],
    [["record_stock_losses", "view_stock_balances"]],
    [["sell_and_charge", "not_a_real_permission"]],
  ])("is false for %j", (keys) => {
    expect(lacksARequiredPermission(keys)).toBe(false);
  });

  it("is false exactly for sets already closed under the requirements", () => {
    fc.assert(
      fc.property(permissionSet, (keys) => {
        expect(lacksARequiredPermission(keys)).toBe(
          withRequiredPermissions(keys).size !== keys.length,
        );
      }),
    );
  });
});

describe("permissionsRequiring", () => {
  it("names each held permission that requires the given one, in catalog order", () => {
    const held: PermissionKey[] = [
      "record_stock_losses",
      "view_stock_balances",
      "perform_stock_counts",
      "sell_and_charge",
    ];

    expect(permissionsRequiring("view_stock_balances", held)).toEqual([
      "perform_stock_counts",
      "record_stock_losses",
    ]);
  });

  it("names nothing when no held permission requires it", () => {
    expect(permissionsRequiring("view_stock_balances", ["view_stock_balances"])).toEqual([]);
    expect(permissionsRequiring("adjust_stock", ["adjust_stock", "view_stock_balances"])).toEqual(
      [],
    );
  });
});
