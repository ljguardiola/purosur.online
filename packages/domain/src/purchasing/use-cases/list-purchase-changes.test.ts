import { describe, expect, it } from "vitest";
import { listPurchaseChanges } from "./list-purchase-changes.js";
import type { PurchaseChangeListing, PurchaseChangeProduct } from "./purchase-change-reader.js";
import type { PurchaseCorrectionChange } from "./purchase-correction-store.js";
import { FakePurchaseChangeReader } from "./test-support/fake-purchase-change-reader.js";

const YERBA: PurchaseChangeProduct = {
  id: "product-yerba",
  name: "Yerba mate",
  brandName: "Del Sur",
  netContent: { quantity: 1, unit: "KG" },
  saleUnit: "UNIT",
};
const FIDEOS: PurchaseChangeProduct = {
  id: "product-fideos",
  name: "Fideos",
  brandName: null,
  netContent: null,
  saleUnit: "KG",
};
const ARROZ: PurchaseChangeProduct = {
  id: "product-arroz",
  name: "Arroz",
  brandName: null,
  netContent: { quantity: 500, unit: "G" },
  saleUnit: "UNIT",
};

function listing(
  id: string,
  correctedAt: string,
  change: PurchaseCorrectionChange = {
    kind: "line_expiry",
    lineId: "line-1",
    previous: null,
    next: "2027-01-01",
  },
): PurchaseChangeListing {
  return {
    id,
    actorId: "person-1",
    actorName: "Ana Perez",
    correctedAt: new Date(correctedAt),
    change,
  };
}

function readerWith(changes: PurchaseChangeListing[], productOfLine: Record<string, string>) {
  const reader = new FakePurchaseChangeReader();
  reader.seed("branch-1", "purchase-a", changes, productOfLine);
  reader.seedProducts(YERBA, FIDEOS, ARROZ);
  return reader;
}

async function listedChanges(reader: FakePurchaseChangeReader) {
  const outcome = await listPurchaseChanges(reader, {
    locationId: "branch-1",
    purchaseId: "purchase-a",
  });
  if (outcome.kind !== "listed") {
    throw new Error(`expected the changes to be listed, got ${outcome.kind}`);
  }
  return outcome.changes;
}

describe("listPurchaseChanges", () => {
  it("lists the changes of the purchase, newest first", async () => {
    const reader = readerWith(
      [
        listing("c-2", "2026-03-06T10:00:00Z"),
        listing("c-3", "2026-03-07T10:00:00Z"),
        listing("c-1", "2026-03-05T10:00:00Z"),
      ],
      { "line-1": YERBA.id },
    );

    const changes = await listedChanges(reader);

    expect(changes.map(({ id }) => id)).toEqual(["c-3", "c-2", "c-1"]);
    expect(changes[0]).toEqual({
      id: "c-3",
      actorId: "person-1",
      actorName: "Ana Perez",
      correctedAt: new Date("2026-03-07T10:00:00Z"),
      change: {
        kind: "line_expiry",
        lineId: "line-1",
        product: YERBA,
        previous: null,
        next: "2027-01-01",
      },
    });
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

  it("answers not found for a purchase the branch does not have, reading nothing else", async () => {
    const reader = new FakePurchaseChangeReader();

    const outcome = await listPurchaseChanges(reader, {
      locationId: "branch-1",
      purchaseId: "purchase-a",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(reader.askedFor).toEqual(["branch-1:purchase-a"]);
  });

  it("names each change of a line by the product the line had when it was made", async () => {
    const reader = readerWith(
      [
        listing("c-1", "2026-03-01T10:00:00Z", {
          kind: "line_cost",
          lineId: "line-1",
          previous: 1_000,
          next: 1_200,
        }),
        listing("c-2", "2026-03-02T10:00:00Z", {
          kind: "line_product",
          lineId: "line-1",
          previous: YERBA.id,
          next: FIDEOS.id,
        }),
        listing("c-3", "2026-03-03T10:00:00Z", {
          kind: "line_expiry_split",
          lineId: "line-1",
          quantity: 1_000,
          previous: null,
          next: "2027-01-01",
        }),
        listing("c-4", "2026-03-04T10:00:00Z", {
          kind: "line_product",
          lineId: "line-1",
          previous: FIDEOS.id,
          next: ARROZ.id,
        }),
        listing("c-5", "2026-03-05T10:00:00Z", {
          kind: "line_quantity",
          lineId: "line-1",
          previous: { quantity: 1_000, packages: null },
          next: { quantity: 2_000, packages: null },
        }),
      ],
      { "line-1": ARROZ.id },
    );

    const changes = await listedChanges(reader);

    expect(changes.map(({ id, change }) => [id, change])).toEqual([
      [
        "c-5",
        {
          kind: "line_quantity",
          lineId: "line-1",
          product: ARROZ,
          previous: { quantity: 1_000, packages: null },
          next: { quantity: 2_000, packages: null },
        },
      ],
      ["c-4", { kind: "line_product", lineId: "line-1", previous: FIDEOS, next: ARROZ }],
      [
        "c-3",
        {
          kind: "line_expiry_split",
          lineId: "line-1",
          product: FIDEOS,
          quantity: 1_000,
          previous: null,
          next: "2027-01-01",
        },
      ],
      ["c-2", { kind: "line_product", lineId: "line-1", previous: YERBA, next: FIDEOS }],
      [
        "c-1",
        { kind: "line_cost", lineId: "line-1", product: YERBA, previous: 1_000, next: 1_200 },
      ],
    ]);
  });

  it("keeps naming another line by its own product when a line's product changes", async () => {
    const reader = readerWith(
      [
        listing("c-1", "2026-03-01T10:00:00Z", {
          kind: "line_cost",
          lineId: "line-2",
          previous: 1_000,
          next: 1_200,
        }),
        listing("c-2", "2026-03-02T10:00:00Z", {
          kind: "line_product",
          lineId: "line-1",
          previous: YERBA.id,
          next: FIDEOS.id,
        }),
      ],
      { "line-1": FIDEOS.id, "line-2": ARROZ.id },
    );

    const changes = await listedChanges(reader);

    expect(changes[1]?.change).toEqual({
      kind: "line_cost",
      lineId: "line-2",
      product: ARROZ,
      previous: 1_000,
      next: 1_200,
    });
  });

  it("names the changes of a removed line, and its removal, by the product it had", async () => {
    const reader = readerWith(
      [
        listing("c-1", "2026-03-01T10:00:00Z", {
          kind: "line_expiry",
          lineId: "line-2",
          previous: null,
          next: "2027-01-01",
        }),
        listing("c-2", "2026-03-02T10:00:00Z", {
          kind: "line_removed",
          lineId: "line-2",
          productId: FIDEOS.id,
          quantity: 3_000,
          packages: 3,
          costPaidCents: 900,
          expiresOn: "2027-01-01",
        }),
      ],
      { "line-1": YERBA.id, "line-2": FIDEOS.id },
    );

    const changes = await listedChanges(reader);

    expect(changes.map(({ change }) => change)).toEqual([
      {
        kind: "line_removed",
        lineId: "line-2",
        product: FIDEOS,
        quantity: 3_000,
        packages: 3,
        costPaidCents: 900,
        expiresOn: "2027-01-01",
      },
      {
        kind: "line_expiry",
        lineId: "line-2",
        product: FIDEOS,
        previous: null,
        next: "2027-01-01",
      },
    ]);
  });

  it("names each added line by the product it was added with, and leaves a header change as it was", async () => {
    const header: PurchaseCorrectionChange = {
      kind: "header",
      changes: [{ field: "note", previous: null, next: "Corregida" }],
    };
    const reader = readerWith(
      [
        listing("c-1", "2026-03-01T10:00:00Z", {
          kind: "lines_added",
          lines: [
            {
              lineId: "line-2",
              productId: YERBA.id,
              quantity: 1_000,
              costPaidCents: 500,
              expiresOn: null,
            },
            {
              lineId: "line-3",
              productId: ARROZ.id,
              quantity: 2_000,
              costPaidCents: 700,
              expiresOn: "2027-01-01",
            },
          ],
        }),
        listing("c-2", "2026-03-02T10:00:00Z", {
          kind: "line_product",
          lineId: "line-2",
          previous: YERBA.id,
          next: FIDEOS.id,
        }),
        listing("c-3", "2026-03-03T10:00:00Z", header),
      ],
      { "line-1": YERBA.id, "line-2": FIDEOS.id, "line-3": ARROZ.id },
    );

    const changes = await listedChanges(reader);

    expect(changes[0]?.change).toEqual(header);
    expect(changes[2]?.change).toEqual({
      kind: "lines_added",
      lines: [
        { lineId: "line-2", product: YERBA, quantity: 1_000, costPaidCents: 500, expiresOn: null },
        {
          lineId: "line-3",
          product: ARROZ,
          quantity: 2_000,
          costPaidCents: 700,
          expiresOn: "2027-01-01",
        },
      ],
    });
  });

  it("reads the lines of the purchase and the products its changes name once each", async () => {
    const reader = readerWith(
      [
        listing("c-0", "2026-02-28T10:00:00Z", {
          kind: "header",
          changes: [{ field: "note", previous: null, next: "Corregida" }],
        }),
        listing("c-1", "2026-03-01T10:00:00Z"),
        listing("c-2", "2026-03-02T10:00:00Z", {
          kind: "line_product",
          lineId: "line-1",
          previous: YERBA.id,
          next: FIDEOS.id,
        }),
      ],
      { "line-1": FIDEOS.id },
    );

    await listedChanges(reader);

    expect(reader.askedFor).toEqual([
      "branch-1:purchase-a",
      "lines:purchase-a",
      `products:${[FIDEOS.id, YERBA.id].sort().join(",")}`,
    ]);
  });

  it("fails when a change names a line the purchase does not have", async () => {
    const reader = readerWith([listing("c-1", "2026-03-01T10:00:00Z")], {});

    await expect(listedChanges(reader)).rejects.toThrow(
      "the line line-1 of a purchase change is gone",
    );
  });

  it("fails when a change names a product that is gone", async () => {
    const reader = readerWith([listing("c-1", "2026-03-01T10:00:00Z")], {
      "line-1": "product-gone",
    });

    await expect(listedChanges(reader)).rejects.toThrow(
      "the product product-gone of a purchase change is gone",
    );
  });
});
