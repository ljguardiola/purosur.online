import { describe, expect, it } from "vitest";
import { listPurchaseChanges } from "./list-purchase-changes.js";
import type { PurchaseChangeListing } from "./purchase-change-reader.js";
import { FakePurchaseChangeReader } from "./test-support/fake-purchase-change-reader.js";

function change(id: string, correctedAt: string): PurchaseChangeListing {
  return {
    id,
    actorId: "person-1",
    actorName: "Ana Perez",
    correctedAt: new Date(correctedAt),
    change: { kind: "line_expiry", lineId: "line-1", previous: null, next: "2027-01-01" },
  };
}

describe("listPurchaseChanges", () => {
  it("lists the changes of the purchase, newest first", async () => {
    const reader = new FakePurchaseChangeReader();
    reader.seed("branch-1", "purchase-a", [
      change("c-2", "2026-03-06T10:00:00Z"),
      change("c-3", "2026-03-07T10:00:00Z"),
      change("c-1", "2026-03-05T10:00:00Z"),
    ]);

    const outcome = await listPurchaseChanges(reader, {
      locationId: "branch-1",
      purchaseId: "purchase-a",
    });

    expect(outcome.kind).toBe("listed");
    expect(outcome.kind === "listed" && outcome.changes.map(({ id }) => id)).toEqual([
      "c-3",
      "c-2",
      "c-1",
    ]);
  });

  it("lists an empty history for a purchase never corrected", async () => {
    const reader = new FakePurchaseChangeReader();
    reader.seed("branch-1", "purchase-a", []);

    const outcome = await listPurchaseChanges(reader, {
      locationId: "branch-1",
      purchaseId: "purchase-a",
    });

    expect(outcome).toEqual({ kind: "listed", changes: [] });
  });

  it("answers not found for a purchase the branch does not have", async () => {
    const reader = new FakePurchaseChangeReader();

    const outcome = await listPurchaseChanges(reader, {
      locationId: "branch-1",
      purchaseId: "purchase-a",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(reader.askedFor).toEqual(["branch-1:purchase-a"]);
  });
});
