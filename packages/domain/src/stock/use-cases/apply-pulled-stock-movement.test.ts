import { describe, expect, it } from "vitest";
import { applyPulledStockMovement } from "./apply-pulled-stock-movement.js";
import type { PulledStockMovement } from "./replicated-stock-ledger.js";
import { FakeReplicatedStockLedger } from "./test-support/fake-replicated-stock-ledger.js";

const BREAD = "product-bread";
const SOLD_AT = new Date("2026-10-09T14:20:00.000Z");
const COUNTED_AT = new Date("2026-10-09T15:00:00.000Z");

function pulled(overrides: Partial<PulledStockMovement> = {}): PulledStockMovement {
  return {
    id: "cloud-movement-1",
    productId: BREAD,
    kind: "adjustment",
    delta: 4000,
    occurredAt: COUNTED_AT,
    supersededByCountId: null,
    ...overrides,
  };
}

function ledgerAt(quantity: number): FakeReplicatedStockLedger {
  const ledger = new FakeReplicatedStockLedger();
  ledger.seedBalance(BREAD, quantity);
  return ledger;
}

describe("applyPulledStockMovement", () => {
  it.each([
    ["an adjustment", "adjustment", 4000],
    ["a loss", "loss", -1000],
    ["a count", "count", -2000],
    ["a sale at another register", "sale", -3000],
  ] as const)("adds %s recorded elsewhere to the balance as its delta", (_, kind, delta) => {
    const ledger = ledgerAt(10_000);

    const outcome = applyPulledStockMovement(ledger, pulled({ kind, delta }));

    expect(outcome).toEqual({ kind: "applied" });
    expect(ledger.balanceOf(BREAD)).toBe(10_000 + delta);
    expect(ledger.movement("cloud-movement-1")).toEqual({ supersededByCountId: null });
  });

  it("applies a movement recorded elsewhere once, however many times it arrives", () => {
    const ledger = ledgerAt(10_000);

    applyPulledStockMovement(ledger, pulled());
    const again = applyPulledStockMovement(ledger, pulled());

    expect(again).toEqual({ kind: "unchanged" });
    expect(ledger.balanceOf(BREAD)).toBe(14_000);
  });

  it("records a movement recorded elsewhere that a count superseded without moving the balance", () => {
    const ledger = ledgerAt(10_000);

    const outcome = applyPulledStockMovement(
      ledger,
      pulled({ kind: "sale", delta: -3000, supersededByCountId: "count-1" }),
    );

    expect(outcome).toEqual({ kind: "recorded_superseded" });
    expect(ledger.balanceOf(BREAD)).toBe(10_000);
    expect(ledger.movement("cloud-movement-1")).toEqual({ supersededByCountId: "count-1" });
  });

  it("never counts twice a movement the register itself originated", () => {
    const ledger = ledgerAt(10_000);
    ledger.recordOwnSale({ id: "own-sale-movement", productId: BREAD, delta: -3000 });

    const outcome = applyPulledStockMovement(
      ledger,
      pulled({ id: "own-sale-movement", kind: "sale", delta: -3000, occurredAt: SOLD_AT }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(ledger.balanceOf(BREAD)).toBe(7000);
  });

  it("undoes, once, a movement the register originated that the cloud superseded by a count", () => {
    const ledger = ledgerAt(10_000);
    ledger.recordOwnSale({ id: "own-sale-movement", productId: BREAD, delta: -3000 });
    const superseded = pulled({
      id: "own-sale-movement",
      kind: "sale",
      delta: -3000,
      occurredAt: SOLD_AT,
      supersededByCountId: "count-1",
    });

    const outcome = applyPulledStockMovement(ledger, superseded);
    const again = applyPulledStockMovement(ledger, superseded);

    expect(outcome).toEqual({ kind: "undone" });
    expect(again).toEqual({ kind: "unchanged" });
    expect(ledger.balanceOf(BREAD)).toBe(10_000);
    expect(ledger.movement("own-sale-movement")).toEqual({ supersededByCountId: "count-1" });
  });

  describe("a sale made offline and a count registered before it reaches the cloud", () => {
    const backofficeCount = pulled({
      id: "backoffice-count",
      kind: "count",
      delta: -3000,
      occurredAt: COUNTED_AT,
    });
    const supersededSale = pulled({
      id: "own-sale-movement",
      kind: "sale",
      delta: -3000,
      occurredAt: SOLD_AT,
      supersededByCountId: "backoffice-count",
    });

    it.each([
      ["the count first", [backofficeCount, supersededSale]],
      ["the superseded sale first", [supersededSale, backofficeCount]],
    ])("leave the register at the counted balance, receiving %s", (_, arrivals) => {
      const ledger = ledgerAt(10_000);
      ledger.recordOwnSale({ id: "own-sale-movement", productId: BREAD, delta: -3000 });
      expect(ledger.balanceOf(BREAD)).toBe(7000);

      for (const movement of [...arrivals, ...arrivals]) {
        applyPulledStockMovement(ledger, movement);
      }

      expect(ledger.balanceOf(BREAD)).toBe(7000);
    });
  });
});
