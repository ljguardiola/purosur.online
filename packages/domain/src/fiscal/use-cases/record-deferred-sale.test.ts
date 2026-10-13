import { describe, expect, it } from "vitest";
import { type DeferredSale, SHORT_CODE_ATTEMPTS } from "../model/deferred-sale.js";
import { ShortCodeTaken } from "./deferred-sale-ports.js";
import { recordDeferredSale, recordDeferredSaleAsync } from "./record-deferred-sale.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const FACTS = {
  saleId: "sale-1",
  occurredAt: new Date("2026-10-02T02:30:00.000Z"),
  total: 12_500,
  reason: "fiscally_offline",
  routedAt: new Date("2026-10-02T02:30:01.000Z"),
} as const;

const CODES = ["7KQ4M2P9", "R3XW8H5N", "ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];

function takenUntil(accepted: number, taken: DeferredSale[] = []) {
  return (sale: DeferredSale): void => {
    taken.push(sale);
    if (taken.length <= accepted) {
      throw new ShortCodeTaken();
    }
  };
}

describe("recordDeferredSale", () => {
  it("records the sale's facts under an identifier and a short code drawn for it", () => {
    const recorded: DeferredSale[] = [];

    const sale = recordDeferredSale(
      (deferred) => recorded.push(deferred),
      new SequentialIds(),
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(sale).toEqual({ ...FACTS, id: "id-1", shortCode: "7KQ4M2P9" });
    expect(recorded).toEqual([sale]);
  });

  it("draws another short code, keeping the identifier, when the short code is already taken", () => {
    const attempts: DeferredSale[] = [];
    const ids = new SequentialIds();

    const sale = recordDeferredSale(
      takenUntil(2, attempts),
      ids,
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(attempts.map(({ id, shortCode }) => [id, shortCode])).toEqual([
      ["id-1", "7KQ4M2P9"],
      ["id-1", "R3XW8H5N"],
      ["id-1", "ABCDEFGH"],
    ]);
    expect(sale.shortCode).toBe("ABCDEFGH");
    expect(ids.issued).toBe(1);
  });

  it("gives up with the refusal after the attempts the domain allows", () => {
    const attempts: DeferredSale[] = [];
    const codes = new ScriptedShortCodes(
      Array.from({ length: SHORT_CODE_ATTEMPTS + 1 }, () => "7KQ4M2P9"),
    );

    expect(() =>
      recordDeferredSale(
        takenUntil(Number.MAX_SAFE_INTEGER, attempts),
        new SequentialIds(),
        codes,
        FACTS,
      ),
    ).toThrow(ShortCodeTaken);
    expect(attempts).toHaveLength(SHORT_CODE_ATTEMPTS);
  });

  it("does not retry a failure that is not a taken short code", () => {
    const attempts: DeferredSale[] = [];

    expect(() =>
      recordDeferredSale(
        (sale) => {
          attempts.push(sale);
          throw new Error("disk full");
        },
        new SequentialIds(),
        new ScriptedShortCodes(CODES),
        FACTS,
      ),
    ).toThrow("disk full");
    expect(attempts).toHaveLength(1);
  });
});

describe("recordDeferredSaleAsync", () => {
  it("records the sale's facts under an identifier and a short code drawn for it", async () => {
    const recorded: DeferredSale[] = [];

    const sale = await recordDeferredSaleAsync(
      async (deferred) => {
        recorded.push(deferred);
      },
      new SequentialIds(),
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(sale).toEqual({ ...FACTS, id: "id-1", shortCode: "7KQ4M2P9" });
    expect(recorded).toEqual([sale]);
  });

  it("draws another short code, keeping the identifier, when the short code is already taken", async () => {
    const attempts: DeferredSale[] = [];
    const ids = new SequentialIds();
    const record = takenUntil(1, attempts);

    const sale = await recordDeferredSaleAsync(
      async (deferred) => record(deferred),
      ids,
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(attempts.map(({ id, shortCode }) => [id, shortCode])).toEqual([
      ["id-1", "7KQ4M2P9"],
      ["id-1", "R3XW8H5N"],
    ]);
    expect(sale.shortCode).toBe("R3XW8H5N");
    expect(ids.issued).toBe(1);
  });

  it("gives up with the refusal after the attempts the domain allows", async () => {
    const attempts: DeferredSale[] = [];
    const record = takenUntil(Number.MAX_SAFE_INTEGER, attempts);
    const codes = new ScriptedShortCodes(
      Array.from({ length: SHORT_CODE_ATTEMPTS + 1 }, () => "7KQ4M2P9"),
    );

    await expect(
      recordDeferredSaleAsync(async (sale) => record(sale), new SequentialIds(), codes, FACTS),
    ).rejects.toThrow(ShortCodeTaken);
    expect(attempts).toHaveLength(SHORT_CODE_ATTEMPTS);
  });

  it("does not retry a failure that is not a taken short code", async () => {
    let attempts = 0;

    await expect(
      recordDeferredSaleAsync(
        async () => {
          attempts += 1;
          throw new Error("disk full");
        },
        new SequentialIds(),
        new ScriptedShortCodes(CODES),
        FACTS,
      ),
    ).rejects.toThrow("disk full");
    expect(attempts).toBe(1);
  });
});
