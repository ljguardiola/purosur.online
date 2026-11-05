import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseChangeSchema, purchaseChangesSchema } from "./purchase-changes.js";

const actor = { id: "person-1", name: "Ana Perez" };
const correctedAt = "2026-03-10T15:00:00.000Z";
const yerba = {
  id: "p-1",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 500, unit: "G" },
  saleUnit: "UNIT",
};
const harina = { id: "p-2", name: "Harina", brandName: null, netContent: null, saleUnit: "KG" };

describe("purchaseChangesSchema", () => {
  it("accepts a header change with each changed field's previous and new value", () => {
    const changes = [
      {
        id: "c-1",
        actor,
        correctedAt,
        change: {
          kind: "header",
          changes: [
            { field: "purchasedOn", previous: "2026-03-05", next: "2026-03-04" },
            { field: "receiptType", previous: "factura_b", next: "remito" },
            { field: "receiptNumber", previous: null, next: "0001-1" },
            { field: "note", previous: "a", next: null },
          ],
        },
      },
    ];

    expect(purchaseChangesSchema.safeParse(changes).data).toEqual(changes);
  });

  it("accepts added lines and a line's expiry, part-of-line expiry and cost changes, each naming its product", () => {
    const changes = [
      {
        id: "c-2",
        actor,
        correctedAt,
        change: {
          kind: "lines_added",
          lines: [
            {
              lineId: "line-3",
              product: harina,
              quantity: 10_000,
              costPaidCents: 500_000,
              expiresOn: "2027-01-31",
            },
          ],
        },
      },
      {
        id: "c-3",
        actor,
        correctedAt,
        change: {
          kind: "line_expiry",
          lineId: "line-1",
          product: yerba,
          previous: "2026-11-10",
          next: null,
        },
      },
      {
        id: "c-5",
        actor,
        correctedAt,
        change: {
          kind: "line_expiry_split",
          lineId: "line-1",
          product: yerba,
          quantity: 1_000,
          previous: "2026-11-10",
          next: null,
        },
      },
      {
        id: "c-4",
        actor,
        correctedAt,
        change: {
          kind: "line_cost",
          lineId: "line-1",
          product: yerba,
          previous: 1_450_050,
          next: 1_200_000,
        },
      },
      {
        id: "c-6",
        actor,
        correctedAt,
        change: {
          kind: "line_quantity",
          lineId: "line-1",
          product: harina,
          previous: { quantity: 24_000, packages: 2 },
          next: { quantity: 2_500, packages: null },
        },
      },
    ];

    expect(purchaseChangesSchema.safeParse(changes).data).toEqual(changes);
  });

  it("accepts a line's product change and removal, naming the products as a purchase's line does", () => {
    const changes = [
      {
        id: "c-7",
        actor,
        correctedAt,
        change: { kind: "line_product", lineId: "line-1", previous: yerba, next: harina },
      },
      {
        id: "c-8",
        actor,
        correctedAt,
        change: {
          kind: "line_removed",
          lineId: "line-2",
          product: harina,
          quantity: 2_500,
          packages: null,
          costPaidCents: 90_000,
          expiresOn: null,
        },
      },
      {
        id: "c-9",
        actor,
        correctedAt,
        change: {
          kind: "line_removed",
          lineId: "line-1",
          product: yerba,
          quantity: 24_000,
          packages: 2,
          costPaidCents: 1_450_050,
          expiresOn: "2027-01-31",
        },
      },
    ];

    expect(purchaseChangesSchema.safeParse(changes).data).toEqual(changes);
  });

  it.each([
    { kind: "line_product", lineId: "line-1", previous: "p-1", next: "p-2" },
    {
      kind: "line_removed",
      lineId: "line-1",
      product: "p-1",
      quantity: 1_000,
      packages: null,
      costPaidCents: 1_000,
      expiresOn: null,
    },
    {
      kind: "line_removed",
      lineId: "line-1",
      product: { id: "p-1", name: "Yerba", brandName: null, netContent: null, saleUnit: "UNIT" },
      quantity: 1_000,
      costPaidCents: 1_000,
      expiresOn: null,
    },
    { kind: "line_cost", lineId: "line-1", previous: 1_000, next: 1_200 },
    { kind: "line_expiry", lineId: "line-1", product: "p-1", previous: null, next: null },
    {
      kind: "line_expiry_split",
      lineId: "line-1",
      quantity: 1_000,
      previous: null,
      next: null,
    },
    {
      kind: "line_quantity",
      lineId: "line-1",
      previous: { quantity: 1_000, packages: null },
      next: { quantity: 2_000, packages: null },
    },
    {
      kind: "lines_added",
      lines: [
        {
          lineId: "line-3",
          productId: "p-1",
          quantity: 10_000,
          costPaidCents: 500_000,
          expiresOn: null,
        },
      ],
    },
  ])("rejects the change %j", (change) => {
    expect(purchaseChangesSchema.safeParse([{ id: "c", actor, correctedAt, change }]).success).toBe(
      false,
    );
  });

  it("accepts an old record of added lines that carries a lot number, without the lot number", () => {
    const added = {
      lineId: "line-3",
      product: harina,
      quantity: 10_000,
      costPaidCents: 500_000,
      expiresOn: null,
    };
    const [parsed] =
      purchaseChangesSchema.parse([
        {
          id: "c-2",
          actor,
          correctedAt,
          change: { kind: "lines_added", lines: [{ ...added, lotNumber: "L-9" }] },
        },
      ]) ?? [];

    expect(parsed?.change).toEqual({ kind: "lines_added", lines: [added] });
  });

  it("accepts an empty history", () => {
    expect(purchaseChangesSchema.safeParse([]).success).toBe(true);
  });

  it.each([
    { kind: "removed_line" },
    { kind: "header", changes: [{ field: "supplierId", previous: "a", next: "b" }] },
    { kind: "header", changes: [{ field: "receiptType", previous: "factura_a", next: "remito" }] },
  ])("rejects the change %j", (change) => {
    expect(purchaseChangesSchema.safeParse([{ id: "c", actor, correctedAt, change }]).success).toBe(
      false,
    );
  });

  it("rejects a correction time that is not an instant", () => {
    const change = { kind: "line_expiry", lineId: "l", product: yerba, previous: null, next: null };

    expect(
      purchaseChangesSchema.safeParse([{ id: "c", actor, correctedAt: "yesterday", change }])
        .success,
    ).toBe(false);
  });
});

describe("purchaseChangeSchema, declared time zone", () => {
  it("declares the zone the correction instant is shown in", () => {
    expect(purchaseChangeSchema.shape.correctedAt.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
