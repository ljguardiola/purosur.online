import { describe, expect, it } from "vitest";
import { type DeferredSale, SHORT_CODE_ATTEMPTS } from "../model/deferred-sale.js";
import { deferredSaleRecordedEvent } from "../model/deferred-sale-recorded-event.js";
import { ShortCodeTaken } from "./deferred-sale-ports.js";
import {
  type DeferredSaleRecording,
  recordDeferredSale,
  recordDeferredSaleAsync,
} from "./record-deferred-sale.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const FACTS = {
  saleId: "sale-1",
  occurredAt: new Date("2026-10-02T02:30:00.000Z"),
  total: 12_500,
  reason: "fiscally_offline",
  routedAt: new Date("2026-10-02T02:30:01.000Z"),
  origin: { registerId: "register-1", actorId: "cashier" },
} as const;

const CODES = ["7KQ4M2P9", "R3XW8H5N", "ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];

function eventOf(sale: DeferredSale, eventId: string) {
  return deferredSaleRecordedEvent({ eventId, ...FACTS.origin, deferredSale: sale });
}

function takenUntil(accepted: number, taken: DeferredSaleRecording[] = []) {
  return (recording: DeferredSaleRecording): void => {
    taken.push(recording);
    if (taken.length <= accepted) {
      throw new ShortCodeTaken();
    }
  };
}

function attemptsOf(attempts: readonly DeferredSaleRecording[]) {
  return attempts.map(({ sale: { id, shortCode }, event }) => [id, shortCode, event.event_id]);
}

describe("recordDeferredSale", () => {
  it("records the sale's facts under an identifier and a short code drawn for it, with the event that carries them", () => {
    const recorded: DeferredSaleRecording[] = [];

    const sale = recordDeferredSale(
      (recording) => recorded.push(recording),
      new SequentialIds(),
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    const { origin: _origin, ...recordedFacts } = FACTS;
    expect(sale).toEqual({ ...recordedFacts, id: "id-1", shortCode: "7KQ4M2P9" });
    expect(recorded).toEqual([{ sale, event: eventOf(sale, "id-2") }]);
  });

  it("draws another short code, keeping the identifiers, when the short code is already taken", () => {
    const attempts: DeferredSaleRecording[] = [];
    const ids = new SequentialIds();

    const sale = recordDeferredSale(
      takenUntil(2, attempts),
      ids,
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(attemptsOf(attempts)).toEqual([
      ["id-1", "7KQ4M2P9", "id-2"],
      ["id-1", "R3XW8H5N", "id-2"],
      ["id-1", "ABCDEFGH", "id-2"],
    ]);
    expect(attempts.at(-1)).toEqual({ sale, event: eventOf(sale, "id-2") });
    expect(sale.shortCode).toBe("ABCDEFGH");
    expect(ids.issued).toBe(2);
  });

  it("gives up with the refusal after the attempts the domain allows", () => {
    const attempts: DeferredSaleRecording[] = [];
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
    const attempts: DeferredSaleRecording[] = [];

    expect(() =>
      recordDeferredSale(
        (recording) => {
          attempts.push(recording);
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
  it("records the sale's facts under an identifier and a short code drawn for it, with the event that carries them", async () => {
    const recorded: DeferredSaleRecording[] = [];

    const sale = await recordDeferredSaleAsync(
      async (recording) => {
        recorded.push(recording);
      },
      new SequentialIds(),
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    const { origin: _origin, ...recordedFacts } = FACTS;
    expect(sale).toEqual({ ...recordedFacts, id: "id-1", shortCode: "7KQ4M2P9" });
    expect(recorded).toEqual([{ sale, event: eventOf(sale, "id-2") }]);
  });

  it("draws another short code, keeping the identifiers, when the short code is already taken", async () => {
    const attempts: DeferredSaleRecording[] = [];
    const ids = new SequentialIds();
    const record = takenUntil(1, attempts);

    const sale = await recordDeferredSaleAsync(
      async (recording) => record(recording),
      ids,
      new ScriptedShortCodes(CODES),
      FACTS,
    );

    expect(attemptsOf(attempts)).toEqual([
      ["id-1", "7KQ4M2P9", "id-2"],
      ["id-1", "R3XW8H5N", "id-2"],
    ]);
    expect(attempts.at(-1)).toEqual({ sale, event: eventOf(sale, "id-2") });
    expect(sale.shortCode).toBe("R3XW8H5N");
    expect(ids.issued).toBe(2);
  });

  it("gives up with the refusal after the attempts the domain allows", async () => {
    const attempts: DeferredSaleRecording[] = [];
    const record = takenUntil(Number.MAX_SAFE_INTEGER, attempts);
    const codes = new ScriptedShortCodes(
      Array.from({ length: SHORT_CODE_ATTEMPTS + 1 }, () => "7KQ4M2P9"),
    );

    await expect(
      recordDeferredSaleAsync(
        async (recording) => record(recording),
        new SequentialIds(),
        codes,
        FACTS,
      ),
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
