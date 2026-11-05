import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseChangeSchema, purchaseChangesSchema } from "./purchase-changes.js";

const actor = { id: "person-1", name: "Ana Perez" };
const correctedAt = "2026-03-10T15:00:00.000Z";

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

  it("accepts added lines and a line's expiry, part-of-line expiry and cost changes", () => {
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
              productId: "product-a",
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
        change: { kind: "line_expiry", lineId: "line-1", previous: "2026-11-10", next: null },
      },
      {
        id: "c-5",
        actor,
        correctedAt,
        change: {
          kind: "line_expiry_split",
          lineId: "line-1",
          quantity: 1_000,
          previous: "2026-11-10",
          next: null,
        },
      },
      {
        id: "c-4",
        actor,
        correctedAt,
        change: { kind: "line_cost", lineId: "line-1", previous: 1_450_050, next: 1_200_000 },
      },
    ];

    expect(purchaseChangesSchema.safeParse(changes).data).toEqual(changes);
  });

  it("accepts an old record of added lines that carries a lot number, without the lot number", () => {
    const added = {
      lineId: "line-3",
      productId: "product-a",
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
    const change = { kind: "line_expiry", lineId: "l", previous: null, next: null };

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
