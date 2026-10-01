import { describe, expect, it } from "vitest";
import { pullAudienceOf } from "../model/pull-audience.js";
import { pullChanges } from "./pull-changes.js";
import { FakeChangeLog, type FakeLoggedChange } from "./test-support/fake-change-log.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const BRANCH = "branch-a";
const OTHER_BRANCH = "branch-b";
const DEVICE = "device-1";
const INSTALLED_REGISTER = {
  registerId: "register-1",
  locationId: BRANCH,
  priceListId: "price-list-a",
};

function changesFor(locationId: string, firstSeq: number, count: number): FakeLoggedChange[] {
  return Array.from({ length: count }, (_, index) => ({
    changeSeq: firstSeq + index,
    entity: "user",
    entityId: `user-${firstSeq + index}`,
    locationId,
  }));
}

function fakeChangeLog(changes: FakeLoggedChange[]): FakeChangeLog {
  return new FakeChangeLog(changes, { [DEVICE]: INSTALLED_REGISTER });
}

function pull(changeLog: FakeChangeLog, since: number) {
  return pullChanges({ changeLog, clock: { now: () => NOW } }, { deviceId: DEVICE, since });
}

describe("pulling changes", () => {
  it("gives a brand-new installation, from the very first change, only what the register it is installed in may pull", async () => {
    const ownUser: FakeLoggedChange = {
      changeSeq: 1,
      entity: "user",
      entityId: "user-a",
      locationId: BRANCH,
    };
    const ownPrice: FakeLoggedChange = {
      changeSeq: 3,
      entity: "price",
      entityId: "price-a",
      priceListId: "price-list-a",
    };
    const ownRegister: FakeLoggedChange = {
      changeSeq: 5,
      entity: "register",
      entityId: "register-1",
    };
    const category: FakeLoggedChange = { changeSeq: 7, entity: "category", entityId: "category-1" };
    const changeLog = fakeChangeLog([
      ownUser,
      { changeSeq: 2, entity: "user", entityId: "user-b", locationId: OTHER_BRANCH },
      ownPrice,
      { changeSeq: 4, entity: "price", entityId: "price-b", priceListId: "price-list-b" },
      ownRegister,
      { changeSeq: 6, entity: "register", entityId: "register-2" },
      category,
    ]);

    const page = await pull(changeLog, 0);

    expect(page).toEqual({
      changes: [ownUser, ownPrice, ownRegister, category],
      cursor: 7,
      hasMore: false,
    });
  });

  it("gives only the changes after the cursor it is asked from", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 5));

    const page = await pull(changeLog, 3);

    expect(page).toEqual({ changes: changesFor(BRANCH, 4, 2), cursor: 5, hasMore: false });
  });

  it("gives 500 changes and says more wait when more than 500 do", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 1_200));

    const page = await pull(changeLog, 0);

    expect(page).toEqual({ changes: changesFor(BRANCH, 1, 500), cursor: 500, hasMore: true });
    expect(changeLog.readRequests).toEqual([
      { audience: pullAudienceOf(INSTALLED_REGISTER), since: 0, limit: 501 },
    ]);
  });

  it("asks for what the register the device is installed in may pull, with its branch's price list", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 1));

    await pull(changeLog, 0);

    expect(changeLog.readRequests[0]?.audience).toEqual(pullAudienceOf(INSTALLED_REGISTER));
  });

  it("keeps the cursor when nothing is left", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 3));

    expect(await pull(changeLog, 3)).toEqual({ changes: [], cursor: 3, hasMore: false });
  });

  it("records the cursor the device asked from and when it asked, replacing the previous one", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 3));

    await pull(changeLog, 0);
    await pull(changeLog, 3);

    expect(changeLog.state.observedPulls).toEqual([{ deviceId: DEVICE, since: 3, at: NOW }]);
  });

  it("records nothing when the changes could not be read", async () => {
    const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 3));
    changeLog.failReading = true;

    await expect(pull(changeLog, 0)).rejects.toThrow("the change log could not be read");
    expect(changeLog.state.observedPulls).toEqual([]);
  });
});
