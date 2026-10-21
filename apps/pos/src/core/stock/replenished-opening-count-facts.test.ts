import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { applyReplenishedOpeningCountFact } from "./replenished-opening-count-facts";

type OpeningCountFact = Extract<
  SyncedFact,
  { kind: "opening_count_recorded" | "opening_count_withdrawn" }
>;

const COUNTED_AT = new Date("2026-10-07T09:00:00.000Z");

let database: LocalDatabase;

function counted(overrides: Partial<{ movementId: string; counted: number }> = {}) {
  return {
    kind: "opening_count_recorded",
    count: {
      movementId: "movement-1",
      productId: "product-1",
      counted: 6000,
      expiresOn: "2027-01-31",
      countedAt: COUNTED_AT,
      actorId: "cashier-1",
      ...overrides,
    },
  } satisfies OpeningCountFact;
}

function withdrawn(overrides: Partial<{ movementId: string; withdrawnMovementId: string }> = {}) {
  return {
    kind: "opening_count_withdrawn",
    withdrawal: {
      movementId: "movement-2",
      withdrawnMovementId: "movement-1",
      withdrawnAt: new Date("2026-10-07T09:10:00.000Z"),
      actorId: "cashier-1",
      ...overrides,
    },
  } satisfies OpeningCountFact;
}

function movements() {
  return database
    .prepare(
      `SELECT id, product_id, kind, delta, occurred_at, expires_on, withdraws_movement_id
         FROM stock_movements ORDER BY rowid`,
    )
    .all();
}

function balance(): number | undefined {
  return database
    .prepare<[], { quantity: number }>(
      "SELECT quantity FROM stock_balances WHERE product_id = 'product-1'",
    )
    .get()?.quantity;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("replenishing the opening count facts of a restored register", () => {
  describe("a recorded opening count", () => {
    it("is held as a movement of the product's stock with what was counted and when it expires", () => {
      applyReplenishedOpeningCountFact(database, counted());

      expect(movements()).toEqual([
        {
          id: "movement-1",
          product_id: "product-1",
          kind: "opening_count",
          delta: 6000,
          occurred_at: "2026-10-07T09:00:00.000Z",
          expires_on: "2027-01-31",
          withdraws_movement_id: null,
        },
      ]);
    });

    it("adds what was counted to the product's balance", () => {
      applyReplenishedOpeningCountFact(database, counted());
      applyReplenishedOpeningCountFact(
        database,
        counted({ movementId: "movement-3", counted: 500 }),
      );

      expect(balance()).toBe(6500);
    });

    it("changes nothing when the snapshot already holds the movement", () => {
      applyReplenishedOpeningCountFact(database, counted());
      const before = { movements: movements(), balance: balance() };

      applyReplenishedOpeningCountFact(database, counted());

      expect({ movements: movements(), balance: balance() }).toEqual(before);
    });
  });

  describe("a withdrawn opening count", () => {
    beforeEach(() => {
      applyReplenishedOpeningCountFact(database, counted());
    });

    it("is held as a movement that takes back what the count added, naming the count it withdraws", () => {
      applyReplenishedOpeningCountFact(database, withdrawn());

      expect(movements().at(-1)).toEqual({
        id: "movement-2",
        product_id: "product-1",
        kind: "opening_count_withdrawal",
        delta: -6000,
        occurred_at: "2026-10-07T09:10:00.000Z",
        expires_on: null,
        withdraws_movement_id: "movement-1",
      });
    });

    it("takes what the count added out of the product's balance", () => {
      applyReplenishedOpeningCountFact(database, withdrawn());

      expect(balance()).toBe(0);
    });

    it("changes nothing when the snapshot already holds the withdrawal", () => {
      applyReplenishedOpeningCountFact(database, withdrawn());
      const before = { movements: movements(), balance: balance() };

      applyReplenishedOpeningCountFact(database, withdrawn());

      expect({ movements: movements(), balance: balance() }).toEqual(before);
    });

    it("is refused for a count the register does not hold", () => {
      expect(() =>
        applyReplenishedOpeningCountFact(
          database,
          withdrawn({ withdrawnMovementId: "movement-9" }),
        ),
      ).toThrow("opening count movement-9 is not held");
    });
  });
});
