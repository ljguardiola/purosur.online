import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { supplierItemKey } from "./supplier-item.js";
import {
  planReread,
  type RemovedItem,
  type RereadCurrentRow,
  type RereadPageRow,
} from "./supplier-price-list-reread.js";

function current(
  id: string,
  description: string,
  priceCents: number | null,
  overrides: Partial<RereadCurrentRow> = {},
): RereadCurrentRow {
  return { id, description, code: null, presentation: null, priceCents, ...overrides };
}

function page(
  description: string,
  priceCents: number | null,
  overrides: Partial<RereadPageRow<string>> = {},
): RereadPageRow<string> {
  return {
    description,
    code: null,
    presentation: null,
    priceCents,
    page: null,
    barcode: null,
    link: null,
    ...overrides,
  };
}

function removed(description: string, priceCents: number | null): RemovedItem {
  return {
    key: supplierItemKey({ code: null, description, presentation: null }),
    priceCents,
  };
}

describe("planReread", () => {
  it("keeps the row of an item that is on the page at the same price, taking the page's other fields", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100, { code: "Y-1" })],
      [],
      [page("YERBA 1 KG", 100, { code: "Y-1", page: 3, barcode: "779", presentation: "Caja" })],
    );

    expect(plan.rows).toEqual([
      {
        kind: "kept",
        rowId: "row-1",
        description: "YERBA 1 KG",
        code: "Y-1",
        presentation: "Caja",
        priceCents: 100,
        page: 3,
        barcode: "779",
      },
    ]);
    expect(plan.droppedRowIds).toEqual([]);
  });

  it("reprices the row of an item whose price changed", () => {
    const plan = planReread([current("row-1", "Yerba 1 kg", 100)], [], [page("Yerba 1 kg", 120)]);

    expect(plan.rows).toEqual([
      expect.objectContaining({ kind: "repriced", rowId: "row-1", priceCents: 120 }),
    ]);
  });

  it("reprices a row whose price became unknown and one whose price became known", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100), current("row-2", "Azucar 1 kg", null)],
      [],
      [page("Yerba 1 kg", null), page("Azucar 1 kg", 90)],
    );

    expect(plan.rows).toEqual([
      expect.objectContaining({ kind: "repriced", rowId: "row-1", priceCents: null }),
      expect.objectContaining({ kind: "repriced", rowId: "row-2", priceCents: 90 }),
    ]);
  });

  it("keeps a row without a price when the page still gives it none", () => {
    const plan = planReread([current("row-1", "Yerba 1 kg", null)], [], [page("Yerba 1 kg", null)]);

    expect(plan.rows).toEqual([expect.objectContaining({ kind: "kept", rowId: "row-1" })]);
  });

  it("adds a row for an item the list does not have, carrying the link it was given", () => {
    const plan = planReread([], [], [page("Yerba 1 kg", 100, { link: "remembered" })]);

    expect(plan.rows).toEqual([
      {
        kind: "added",
        description: "Yerba 1 kg",
        code: null,
        presentation: null,
        priceCents: 100,
        page: null,
        barcode: null,
        link: "remembered",
      },
    ]);
  });

  it("drops the rows of items that are no longer on the page", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100), current("row-2", "Azucar 1 kg", 90)],
      [],
      [page("Azucar 1 kg", 90)],
    );

    expect(plan.droppedRowIds).toEqual(["row-1"]);
    expect(plan.rows).toHaveLength(1);
  });

  it("lists the rows in the page's order", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100), current("row-2", "Azucar 1 kg", 90)],
      [],
      [page("Azucar 1 kg", 90), page("Fideos 500 g", 50), page("Yerba 1 kg", 100)],
    );

    expect(plan.rows.map((row) => row.description)).toEqual([
      "Azucar 1 kg",
      "Fideos 500 g",
      "Yerba 1 kg",
    ]);
    expect(plan.rows.map((row) => row.kind)).toEqual(["kept", "added", "kept"]);
  });

  it("matches rows with the same key in order of appearance", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100), current("row-2", "Yerba 1 kg", 100)],
      [],
      [page("Yerba 1 kg", 100), page("Yerba 1 kg", 130), page("Yerba 1 kg", 100)],
    );

    expect(plan.rows).toEqual([
      expect.objectContaining({ kind: "kept", rowId: "row-1" }),
      expect.objectContaining({ kind: "repriced", rowId: "row-2", priceCents: 130 }),
      expect.objectContaining({ kind: "added", priceCents: 100 }),
    ]);
  });

  it("drops the later rows of a key the page prints fewer times", () => {
    const plan = planReread(
      [current("row-1", "Yerba 1 kg", 100), current("row-2", "Yerba 1 kg", 100)],
      [],
      [page("Yerba 1 kg", 100)],
    );

    expect(plan.rows).toEqual([expect.objectContaining({ kind: "kept", rowId: "row-1" })]);
    expect(plan.droppedRowIds).toEqual(["row-2"]);
  });

  it("matches by the item's code when it has one", () => {
    const plan = planReread(
      [current("row-1", "Yerba vieja", 100, { code: "Y-1" })],
      [],
      [page("Yerba nueva", 100, { code: "Y-1" })],
    );

    expect(plan.rows).toEqual([
      expect.objectContaining({ kind: "kept", rowId: "row-1", description: "Yerba nueva" }),
    ]);
  });

  describe("removed items", () => {
    it("keeps a removed item out of the list while the page prints it at the same price", () => {
      const plan = planReread([], [removed("Yerba 1 kg", 100)], [page("Yerba 1 kg", 100)]);

      expect(plan.rows).toEqual([]);
      expect(plan.remainingRemovedItems).toEqual([removed("Yerba 1 kg", 100)]);
    });

    it("adds a removed item back as a row when its price changed, forgetting its removal", () => {
      const plan = planReread([], [removed("Yerba 1 kg", 100)], [page("Yerba 1 kg", 120)]);

      expect(plan.rows).toEqual([expect.objectContaining({ kind: "added", priceCents: 120 })]);
      expect(plan.remainingRemovedItems).toEqual([]);
    });

    it("forgets the removal of an item the page no longer prints", () => {
      const plan = planReread([], [removed("Yerba 1 kg", 100)], [page("Azucar 1 kg", 90)]);

      expect(plan.remainingRemovedItems).toEqual([]);
    });

    it("keeps a removed item without a price while the page still gives it none", () => {
      const plan = planReread([], [removed("Yerba 1 kg", null)], [page("Yerba 1 kg", null)]);

      expect(plan.rows).toEqual([]);
      expect(plan.remainingRemovedItems).toEqual([removed("Yerba 1 kg", null)]);
    });

    it("takes a row of the list before a removed item of the same key", () => {
      const plan = planReread(
        [current("row-1", "Yerba 1 kg", 100)],
        [removed("Yerba 1 kg", 100)],
        [page("Yerba 1 kg", 100), page("Yerba 1 kg", 100), page("Yerba 1 kg", 100)],
      );

      expect(plan.rows.map((row) => row.kind)).toEqual(["kept", "added"]);
      expect(plan.remainingRemovedItems).toEqual([removed("Yerba 1 kg", 100)]);
    });

    it("holds each removed item to one printing", () => {
      const plan = planReread(
        [],
        [removed("Yerba 1 kg", 100), removed("Yerba 1 kg", 100)],
        [page("Yerba 1 kg", 100)],
      );

      expect(plan.rows).toEqual([]);
      expect(plan.remainingRemovedItems).toEqual([removed("Yerba 1 kg", 100)]);
    });
  });

  it("accounts for every row of the page exactly once", () => {
    const description = fc.constantFrom("a", "b", "c", "d");
    const price = fc.option(fc.integer({ min: 1, max: 3 }), { nil: null });
    fc.assert(
      fc.property(
        fc.array(fc.record({ description, price }), { maxLength: 8 }),
        fc.array(fc.record({ description, price }), { maxLength: 8 }),
        fc.array(fc.record({ description, price }), { maxLength: 8 }),
        (currentRows, removedItems, pageRows) => {
          const plan = planReread(
            currentRows.map((row, index) => current(`row-${index}`, row.description, row.price)),
            removedItems.map((item) => removed(item.description, item.price)),
            pageRows.map((row) => page(row.description, row.price)),
          );

          const matchedIds = plan.rows.flatMap((row) => (row.kind === "added" ? [] : [row.rowId]));
          expect(new Set(matchedIds).size).toBe(matchedIds.length);
          expect([...matchedIds, ...plan.droppedRowIds].sort()).toEqual(
            currentRows.map((_row, index) => `row-${index}`).sort(),
          );
          expect(plan.rows.length + plan.remainingRemovedItems.length).toBeLessThanOrEqual(
            pageRows.length,
          );
          for (const row of plan.rows) {
            if (row.kind === "kept" || row.kind === "repriced") {
              const before = currentRows[Number(row.rowId.slice(4))];
              expect(before?.description).toBe(row.description);
              expect((before?.price === row.priceCents) === (row.kind === "kept")).toBe(true);
            }
          }
        },
      ),
    );
  });
});
