import { describe, expect, it } from "vitest";
import type { DiscountTarget } from "./discount-target.js";
import { type CategoryLink, discountsTargeting } from "./discount-targeting.js";

const categories: CategoryLink[] = [
  { id: "root", parentId: null },
  { id: "middle", parentId: "root" },
  { id: "own", parentId: "middle" },
  { id: "child", parentId: "own" },
  { id: "sibling", parentId: "middle" },
];

const product = { id: "p1", categoryId: "own", tags: [] };

function aimedAt(...targets: DiscountTarget[]) {
  return targets.map((target) => ({ id: `${target.kind}:${target.id}`, target }));
}

function idsTargeting(
  discounts: ReturnType<typeof aimedAt>,
  targeted: Parameters<typeof discountsTargeting>[1] = product,
  links: readonly CategoryLink[] = categories,
): string[] {
  return discountsTargeting(discounts, targeted, links).map(({ id }) => id);
}

describe("discountsTargeting", () => {
  it("keeps the ones aimed at the product itself and leaves out one aimed at another product", () => {
    expect(
      idsTargeting(aimedAt({ kind: "PRODUCT", id: "p1" }, { kind: "PRODUCT", id: "p2" })),
    ).toEqual(["PRODUCT:p1"]);
  });

  it("keeps the ones aimed at its category and at every category above it", () => {
    expect(
      idsTargeting(
        aimedAt(
          { kind: "CATEGORY", id: "own" },
          { kind: "CATEGORY", id: "middle" },
          { kind: "CATEGORY", id: "root" },
        ),
      ),
    ).toEqual(["CATEGORY:own", "CATEGORY:middle", "CATEGORY:root"]);
  });

  it("leaves out the ones aimed at a category below or beside its own", () => {
    expect(
      idsTargeting(aimedAt({ kind: "CATEGORY", id: "child" }, { kind: "CATEGORY", id: "sibling" })),
    ).toEqual([]);
  });

  it("keeps the ones aimed at a tag the product carries actively, not at one it carries inactively", () => {
    const tagged = {
      ...product,
      tags: [
        { tagId: "on", active: true },
        { tagId: "off", active: false },
      ],
    };

    expect(
      idsTargeting(
        aimedAt({ kind: "TAG", id: "on" }, { kind: "TAG", id: "off" }, { kind: "TAG", id: "x" }),
        tagged,
      ),
    ).toEqual(["TAG:on"]);
  });

  it("does not confuse targets of different kinds that share an id", () => {
    const sharing = { id: "same", categoryId: "same", tags: [{ tagId: "same", active: true }] };

    expect(
      idsTargeting(
        aimedAt(
          { kind: "PRODUCT", id: "own" },
          { kind: "CATEGORY", id: "p1" },
          { kind: "TAG", id: "own" },
        ),
        { ...product, tags: [{ tagId: "p1", active: true }] },
      ),
    ).toEqual([]);
    expect(
      idsTargeting(
        aimedAt(
          { kind: "PRODUCT", id: "same" },
          { kind: "CATEGORY", id: "same" },
          { kind: "TAG", id: "same" },
        ),
        sharing,
        [{ id: "same", parentId: null }],
      ),
    ).toEqual(["PRODUCT:same", "CATEGORY:same", "TAG:same"]);
  });

  it("still keeps its own category's discounts when that category is missing from the tree", () => {
    expect(idsTargeting(aimedAt({ kind: "CATEGORY", id: "own" }), product, [])).toEqual([
      "CATEGORY:own",
    ]);
  });

  it("still answers when a corrupt parent chain loops back on itself", () => {
    const looping: CategoryLink[] = [
      { id: "own", parentId: "middle" },
      { id: "middle", parentId: "own" },
    ];

    expect(
      idsTargeting(
        aimedAt({ kind: "CATEGORY", id: "middle" }, { kind: "CATEGORY", id: "root" }),
        product,
        looping,
      ),
    ).toEqual(["CATEGORY:middle"]);
  });
});
