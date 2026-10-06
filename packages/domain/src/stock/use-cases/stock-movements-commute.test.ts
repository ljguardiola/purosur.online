import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { recordAdjustment } from "./record-adjustment.js";
import { recordLoss } from "./record-loss.js";
import { registerCount } from "./register-count.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const START = Date.parse("2026-09-01T12:00:00.000Z");
const MINUTE = 60_000;
const AFTER_EVERYTHING = new Date(START + 1000 * MINUTE);
const KEY = { productId: "product-1", locationId: "branch-1" };

type Operation =
  | { kind: "loss"; minute: number; quantity: number }
  | { kind: "adjustment"; minute: number; direction: "add" | "subtract"; quantity: number }
  | { kind: "count"; minute: number; counted: number };

const minute = fc.integer({ min: 0, max: 30 });
const quantity = fc.integer({ min: 1, max: 50 }).map((units) => units * 1000);

const movement: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ kind: fc.constant("loss" as const), minute, quantity }),
  fc.record({
    kind: fc.constant("adjustment" as const),
    minute,
    direction: fc.constantFrom("add" as const, "subtract" as const),
    quantity,
  }),
);

const counts: fc.Arbitrary<Operation[]> = fc.uniqueArray(
  fc.record({
    kind: fc.constant("count" as const),
    minute,
    counted: fc.integer({ min: 0, max: 50 }).map((units) => units * 1000),
  }),
  { selector: (operation) => operation.minute, maxLength: 4 },
);

const arrivals = fc
  .tuple(fc.array(movement, { maxLength: 8 }), counts)
  .map(([movements, registeredCounts]) => [...movements, ...registeredCounts])
  .chain((operations) =>
    fc.tuple(
      fc.constant(operations),
      fc.shuffledSubarray(operations, {
        minLength: operations.length,
        maxLength: operations.length,
      }),
    ),
  );

async function apply(store: FakeStockStore, operation: Operation): Promise<void> {
  const at = new Date(START + operation.minute * MINUTE);
  const common = { productId: KEY.productId, locationId: KEY.locationId, actorId: "actor-1" };
  if (operation.kind === "loss") {
    await recordLoss(
      { store, clock: new FixedClock(at) },
      { ...common, reason: "theft", quantity: operation.quantity },
    );
  } else if (operation.kind === "adjustment") {
    await recordAdjustment(
      { store, clock: new FixedClock(at) },
      {
        ...common,
        reason: "purchase_correction",
        direction: operation.direction,
        quantity: operation.quantity,
      },
    );
  } else {
    await registerCount(
      { store, clock: new FixedClock(AFTER_EVERYTHING) },
      { ...common, counted: operation.counted, occurredAt: at },
    );
  }
}

async function finalBalance(operations: readonly Operation[]): Promise<number> {
  const store = new FakeStockStore();
  store.seedProduct({ id: KEY.productId, saleUnit: "UNIT" });
  store.seedBalance({ ...KEY, quantity: 10_000 });
  for (const operation of operations) {
    await apply(store, operation);
  }
  return store.balanceOf(KEY);
}

describe("stock movements", () => {
  it("reach the same balance whatever order they arrive in", async () => {
    await fc.assert(
      fc.asyncProperty(arrivals, async ([inOrder, reordered]) => {
        expect(await finalBalance(reordered)).toBe(await finalBalance(inOrder));
      }),
    );
  });

  it("reach the same balance when a late movement arrives after a count it happened before", async () => {
    const loss: Operation = { kind: "loss", minute: 5, quantity: 3000 };
    const recount: Operation = { kind: "count", minute: 10, counted: 7000 };

    expect(await finalBalance([loss, recount])).toBe(7000);
    expect(await finalBalance([recount, loss])).toBe(7000);
  });
});
