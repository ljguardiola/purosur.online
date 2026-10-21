import { describe, expect, it } from "vitest";
import { serveRestoredRegisterReplenishment } from "./serve-restored-register-replenishment.js";
import {
  anEvent,
  aSaleVoidedEvent,
  FakeRestoredRegisterReplenishment,
} from "./test-support/fake-restored-register-replenishment.js";

const REGISTER = "register-1";
const PREDECESSOR = "device-old";
const INPUT = { registerId: REGISTER, predecessorDeviceId: PREDECESSOR, lastAcknowledgedSeq: 52 };

function eventsOf(deviceId: string, firstSeq: number, count: number) {
  return Array.from({ length: count }, (_, index) => anEvent(deviceId, firstSeq + index));
}

describe("serveRestoredRegisterReplenishment", () => {
  it("serves the register's events above the predecessor", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = [anEvent(PREDECESSOR, 53), anEvent("device-newer", 1)];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({ events: replenishment.events, next: null, voidedSaleIds: [] });
  });

  it("reads the events above the position the register reported", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();

    await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(replenishment.eventReads).toEqual([
      {
        registerId: REGISTER,
        position: { predecessorDeviceId: PREDECESSOR, lastAcknowledgedSeq: 52 },
        after: undefined,
        limit: 201,
      },
    ]);
  });

  it("serves a full page of 200 events with where the next one starts when more remain", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = eventsOf(PREDECESSOR, 53, 201);

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({
      events: replenishment.events.slice(0, 200),
      next: { deviceId: PREDECESSOR, deviceSeq: 252 },
      voidedSaleIds: [],
    });
  });

  it("names no next page when exactly 200 events remain", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = eventsOf(PREDECESSOR, 53, 200);

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({ events: replenishment.events, next: null, voidedSaleIds: [] });
  });

  it("continues strictly after the event the register names", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = eventsOf(PREDECESSOR, 53, 3);
    const after = { deviceId: PREDECESSOR, deviceSeq: 54 };

    const outcome = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, after },
    );

    expect(outcome).toEqual({
      events: [anEvent(PREDECESSOR, 55)],
      next: null,
      voidedSaleIds: [],
    });
    expect(replenishment.eventReads[0]?.after).toEqual(after);
  });

  it("names the voided sales whose events are in the page", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = [
      anEvent(PREDECESSOR, 53),
      aSaleVoidedEvent(PREDECESSOR, 54, "sale-7"),
      aSaleVoidedEvent("device-newer", 1, "sale-9"),
    ];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome.voidedSaleIds).toEqual(["sale-7", "sale-9"]);
  });

  it("names only the voided sales of the page it serves, not of the events left for the next one", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = [
      ...eventsOf(PREDECESSOR, 53, 199),
      aSaleVoidedEvent(PREDECESSOR, 252, "sale-in-page"),
      aSaleVoidedEvent(PREDECESSOR, 253, "sale-in-next-page"),
    ];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome.voidedSaleIds).toEqual(["sale-in-page"]);
  });
});
