import { describe, expect, it } from "vitest";
import { findSupplierPriceListReview } from "./find-supplier-price-list-review.js";
import { FakeSupplierPriceListReader } from "./test-support/fake-supplier-price-list-reader.js";

const LIST = {
  id: "list-1",
  supplier: { id: "supplier-a", name: "Distribuidora Sur" },
  sourceKind: "PDF" as const,
  fileName: "lista.pdf",
  listDate: "2026-03-01",
  rowCount: 2,
  unpricedRowCount: 1,
  state: "EXTRACTED" as const,
  readFailure: null,
  uploadedAt: new Date("2026-03-01T12:00:00Z"),
  confirmedAt: null,
  version: 4,
};

describe("findSupplierPriceListReview", () => {
  it("answers not_found for a missing list", async () => {
    expect(await findSupplierPriceListReview(new FakeSupplierPriceListReader(), "list-1")).toEqual({
      kind: "not_found",
    });
  });

  it("answers the list and its rows, each with the page it was read from", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [LIST],
      rows: [
        {
          listId: "list-1",
          id: "row-1",
          description: "Yerba 1 kg",
          code: "Y-1",
          presentation: "Caja x 10",
          priceCents: 150_050,
          page: 3,
        },
        {
          listId: "list-1",
          id: "row-2",
          description: "Azucar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
        },
        {
          listId: "other",
          id: "row-3",
          description: "Ajeno",
          code: null,
          presentation: null,
          priceCents: 1,
          page: 1,
        },
      ],
    });

    const outcome = await findSupplierPriceListReview(reader, "list-1");

    const { confirmedAt: _confirmedAt, ...listed } = LIST;
    expect(outcome).toEqual({
      kind: "found",
      list: { ...listed, replaced: false },
      actions: { changeRows: true, confirm: true, discard: true },
      rows: [
        {
          id: "row-1",
          description: "Yerba 1 kg",
          code: "Y-1",
          presentation: "Caja x 10",
          priceCents: 150_050,
          page: 3,
        },
        {
          id: "row-2",
          description: "Azucar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
        },
      ],
    });
  });

  it("answers that a confirmed list was replaced by a newer confirmed list of its supplier", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        {
          ...LIST,
          state: "REVIEWED",
          listDate: "2026-03-01",
          confirmedAt: new Date("2026-03-02T10:00:00Z"),
        },
        {
          ...LIST,
          id: "list-2",
          state: "REVIEWED",
          listDate: "2026-04-01",
          confirmedAt: new Date("2026-04-02T10:00:00Z"),
          uploadedAt: new Date("2026-04-01T12:00:00Z"),
        },
      ],
    });

    const replaced = await findSupplierPriceListReview(reader, "list-1");
    const current = await findSupplierPriceListReview(reader, "list-2");

    expect(replaced.kind === "found" && replaced.list.replaced).toBe(true);
    expect(current.kind === "found" && current.list.replaced).toBe(false);
  });

  it.each([
    ["READING", { changeRows: false, confirm: false, discard: false }],
    ["READ_FAILED", { changeRows: false, confirm: false, discard: true }],
    ["EXTRACTED", { changeRows: true, confirm: true, discard: true }],
    ["REVIEWED", { changeRows: false, confirm: false, discard: false }],
    ["DISCARDED", { changeRows: false, confirm: false, discard: false }],
  ] as const)("answers which actions a list in state %s allows", async (state, actions) => {
    const reader = new FakeSupplierPriceListReader({ lists: [{ ...LIST, state }] });

    const outcome = await findSupplierPriceListReview(reader, "list-1");

    expect(outcome.kind === "found" && outcome.actions).toEqual(actions);
  });
});
