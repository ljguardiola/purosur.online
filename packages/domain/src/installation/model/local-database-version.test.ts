import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { localDatabaseVersionOf } from "./local-database-version.js";

describe("localDatabaseVersionOf", () => {
  it("is known when every applied migration is one this version knows", () => {
    expect(
      localDatabaseVersionOf({
        applied: ["0000_a", "0001_b"],
        known: ["0000_a", "0001_b"],
      }),
    ).toBe("known");
  });

  it("is known when fewer migrations were applied than this version knows", () => {
    expect(
      localDatabaseVersionOf({
        applied: ["0000_a"],
        known: ["0000_a", "0001_b"],
      }),
    ).toBe("known");
  });

  it("is known when no migration was applied yet", () => {
    expect(localDatabaseVersionOf({ applied: [], known: ["0000_a"] })).toBe("known");
  });

  it("is newer than this version when a migration it does not know was applied", () => {
    expect(
      localDatabaseVersionOf({
        applied: ["0000_a", "0001_b"],
        known: ["0000_a"],
      }),
    ).toBe("newer_than_version");
  });

  it("is newer than this version when the unknown migration is not the last one", () => {
    expect(
      localDatabaseVersionOf({
        applied: ["0000_a", "0002_c"],
        known: ["0000_a", "0001_b"],
      }),
    ).toBe("newer_than_version");
  });

  it("is newer than this version when this version knows no migration", () => {
    expect(localDatabaseVersionOf({ applied: ["0000_a"], known: [] })).toBe("newer_than_version");
  });

  it("is known for any subset of the known migrations whatever their order", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1 })), fc.nat(), (known, cut) => {
        const applied = known.slice(0, cut % (known.length + 1)).reverse();
        expect(localDatabaseVersionOf({ applied, known })).toBe("known");
      }),
    );
  });
});
