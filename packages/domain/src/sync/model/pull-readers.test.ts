import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STOCK_MOVEMENT_KINDS } from "../../stock/index.js";
import { PULLED_ENTITIES } from "./pull-audience.js";
import { readsPulledEntity, unreadableStockMovementKinds } from "./pull-readers.js";
import { versionAtLeast } from "./register-version.js";

const LATER_ADDED_ENTITIES = ["brand", "zone_rules"] as const;
const LATER_ADDED_KINDS = ["return", "assembly_void"] as const;

const part = fc.nat({ max: 5000 });
const aVersion = fc.tuple(part, part, part).map((parts) => parts.join("."));

describe("the entities a register version reads", () => {
  it.each([
    ["brand", "1.0.1363", false],
    ["brand", "1.0.1364", true],
    ["zone_rules", "1.0.1298", false],
    ["zone_rules", "1.0.1299", true],
  ] as const)("reads %s from %s on: %s at %s", (entity, version, reads) => {
    expect(readsPulledEntity(version, entity)).toBe(reads);
  });

  it("reads a later-added entity at any later minor or major version", () => {
    expect(readsPulledEntity("1.1.0", "brand")).toBe(true);
    expect(readsPulledEntity("2.0.0", "zone_rules")).toBe(true);
  });

  it.each([null, "", "unknown", "1.0", "v1.0.1385", "1.0.1385-beta"])(
    "is the oldest reader when its version is %j: reads no later-added entity",
    (version) => {
      for (const entity of LATER_ADDED_ENTITIES) {
        expect(readsPulledEntity(version, entity)).toBe(false);
      }
    },
  );

  it("is read by every version when it was there from the start", () => {
    fc.assert(
      fc.property(fc.option(aVersion, { nil: null }), (version) => {
        for (const entity of PULLED_ENTITIES) {
          if (!(LATER_ADDED_ENTITIES as readonly string[]).includes(entity)) {
            expect(readsPulledEntity(version, entity)).toBe(true);
          }
        }
      }),
    );
  });

  it("is read by a newer version whenever an older one reads it", () => {
    fc.assert(
      fc.property(aVersion, aVersion, (older, newer) => {
        fc.pre(versionAtLeast(newer, older));
        for (const entity of PULLED_ENTITIES) {
          if (readsPulledEntity(older, entity)) {
            expect(readsPulledEntity(newer, entity)).toBe(true);
          }
        }
      }),
    );
  });
});

describe("the stock movement kinds a register version cannot read", () => {
  it.each([
    ["1.0.1283", ["return", "assembly_void"]],
    ["1.0.1284", ["assembly_void"]],
    ["1.0.1321", ["assembly_void"]],
    ["1.0.1322", []],
    ["1.0.1385", []],
    ["2.0.0", []],
  ] as const)("is %s's: %j", (version, unreadable) => {
    expect([...unreadableStockMovementKinds(version)].sort()).toEqual([...unreadable].sort());
  });

  it.each([null, "", "unknown", "1.0", "0.0.1271", "1.0.0"])(
    "is every later-added kind for the oldest reader %j",
    (version) => {
      expect([...unreadableStockMovementKinds(version)].sort()).toEqual(
        [...LATER_ADDED_KINDS].sort(),
      );
    },
  );

  it("is only kinds that stock movements have", () => {
    fc.assert(
      fc.property(fc.option(aVersion, { nil: null }), (version) => {
        for (const kind of unreadableStockMovementKinds(version)) {
          expect(STOCK_MOVEMENT_KINDS).toContain(kind);
        }
      }),
    );
  });
});
