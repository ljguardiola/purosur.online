import { describe, expect, it } from "vitest";
import { purchaseChangesSchema } from "./purchase-changes.js";

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

  it("accepts added lines and a line's expiry change", () => {
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
              lotNumber: null,
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
    ];

    expect(purchaseChangesSchema.safeParse(changes).data).toEqual(changes);
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
