import { describe, expect, it } from "vitest";
import { SALE_COMPLETED_EVENT_TYPE } from "../../shared/index.js";
import { serveRestoredRegisterReplenishment } from "./serve-restored-register-replenishment.js";
import {
  anEvent,
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

    expect(outcome).toEqual({ events: replenishment.events, next: null });
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
        setAsideAbove: new Map(),
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
    });
  });

  it("names no next page when exactly 200 events remain", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = eventsOf(PREDECESSOR, 53, 200);

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({ events: replenishment.events, next: null });
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
    });
    expect(replenishment.eventReads[0]?.after).toEqual(after);
  });

  it("does not serve the events a refused push set aside above its installation's acknowledged ones, a completed sale included", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    const completedSale = anEvent(PREDECESSOR, 3);
    completedSale.event.event_type = SALE_COMPLETED_EVENT_TYPE;
    replenishment.events = [anEvent(PREDECESSOR, 1), completedSale, anEvent("device-newer", 1)];
    replenishment.refusedCopies = [
      { deviceId: PREDECESSOR, deviceSeq: 2 },
      { deviceId: PREDECESSOR, deviceSeq: 3 },
    ];

    const outcome = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, lastAcknowledgedSeq: 0 },
    );

    expect(outcome).toEqual({
      events: [anEvent(PREDECESSOR, 1), anEvent("device-newer", 1)],
      next: null,
    });
  });

  it("serves the acknowledged events a refused push carried again", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = [anEvent(PREDECESSOR, 1), anEvent(PREDECESSOR, 2)];
    replenishment.refusedCopies = [
      { deviceId: PREDECESSOR, deviceSeq: 1 },
      { deviceId: PREDECESSOR, deviceSeq: 2 },
      { deviceId: PREDECESSOR, deviceSeq: 3 },
    ];

    const outcome = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, lastAcknowledgedSeq: 0 },
    );

    expect(outcome).toEqual({
      events: [anEvent(PREDECESSOR, 1), anEvent(PREDECESSOR, 2)],
      next: null,
    });
  });
});
