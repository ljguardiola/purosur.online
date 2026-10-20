import { describe, expect, it } from "vitest";
import { serveRestoredRegisterReplenishment } from "./serve-restored-register-replenishment.js";
import {
  anEvent,
  aUser,
  FakeRestoredRegisterReplenishment,
} from "./test-support/fake-restored-register-replenishment.js";

const REGISTER = "register-1";
const PREDECESSOR = "device-old";
const INPUT = { registerId: REGISTER, predecessorDeviceId: PREDECESSOR, lastAcknowledgedSeq: 52 };

function aReplenishmentOfARevokedPredecessor() {
  const replenishment = new FakeRestoredRegisterReplenishment();
  replenishment.standings.set(`${REGISTER}/${PREDECESSOR}`, "revoked");
  return replenishment;
}

function eventsOf(deviceId: string, firstSeq: number, count: number) {
  return Array.from({ length: count }, (_, index) => anEvent(deviceId, firstSeq + index));
}

describe("serveRestoredRegisterReplenishment", () => {
  it("refuses a predecessor that is not an installation of the register, or unknown", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.events = [anEvent(PREDECESSOR, 53)];
    replenishment.users = [aUser("user-1")];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({ kind: "predecessor_not_of_register" });
    expect(replenishment.eventReads).toEqual([]);
    expect(replenishment.userReads).toEqual([]);
  });

  it("refuses a predecessor of the register that is not revoked", async () => {
    const replenishment = new FakeRestoredRegisterReplenishment();
    replenishment.standings.set(`${REGISTER}/${PREDECESSOR}`, "not_revoked");
    replenishment.events = [anEvent(PREDECESSOR, 53)];
    replenishment.users = [aUser("user-1")];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({ kind: "predecessor_not_revoked" });
    expect(replenishment.eventReads).toEqual([]);
    expect(replenishment.userReads).toEqual([]);
  });

  it("serves the register's events and the branch's users for a revoked predecessor", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = [anEvent(PREDECESSOR, 53), anEvent("device-newer", 1)];
    replenishment.users = [aUser("user-1"), aUser("user-2")];

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toEqual({
      kind: "replenishment",
      events: replenishment.events,
      next: null,
      users: replenishment.users,
    });
    expect(replenishment.userReads).toEqual([REGISTER]);
  });

  it("reads the events above the position the register reported", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();

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
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = eventsOf(PREDECESSOR, 53, 201);

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toMatchObject({
      kind: "replenishment",
      events: replenishment.events.slice(0, 200),
      next: { deviceId: PREDECESSOR, deviceSeq: 252 },
    });
  });

  it("names no next page when exactly 200 events remain", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = eventsOf(PREDECESSOR, 53, 200);

    const outcome = await serveRestoredRegisterReplenishment({ replenishment }, INPUT);

    expect(outcome).toMatchObject({ events: replenishment.events, next: null });
  });

  it("continues strictly after the event the register names", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = eventsOf(PREDECESSOR, 53, 3);
    const after = { deviceId: PREDECESSOR, deviceSeq: 54 };

    const outcome = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, after },
    );

    expect(outcome).toMatchObject({ events: [anEvent(PREDECESSOR, 55)], next: null });
    expect(replenishment.eventReads[0]?.after).toEqual(after);
  });

  it("serves the branch's users on every page", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = eventsOf(PREDECESSOR, 53, 201);
    replenishment.users = [aUser("user-1")];

    const second = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, after: { deviceId: PREDECESSOR, deviceSeq: 252 } },
    );

    expect(second).toMatchObject({
      events: [anEvent(PREDECESSOR, 253)],
      users: replenishment.users,
    });
  });

  it("refuses a cursor that names an installation outside the replenishment, reading nothing", async () => {
    const replenishment = aReplenishmentOfARevokedPredecessor();
    replenishment.events = eventsOf(PREDECESSOR, 53, 3);
    replenishment.users = [aUser("user-1")];
    replenishment.refusedCursorDeviceIds.add("device-elsewhere");

    const outcome = await serveRestoredRegisterReplenishment(
      { replenishment },
      { ...INPUT, after: { deviceId: "device-elsewhere", deviceSeq: 1 } },
    );

    expect(outcome).toEqual({ kind: "cursor_not_of_replenishment" });
    expect(replenishment.eventReads).toEqual([]);
    expect(replenishment.userReads).toEqual([]);
  });
});
