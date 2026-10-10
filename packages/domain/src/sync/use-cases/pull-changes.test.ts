import { describe, expect, it } from "vitest";
import { pullAudienceOf } from "../model/pull-audience.js";
import { pullChanges } from "./pull-changes.js";
import { FakeChangeLog, type FakeLoggedChange } from "./test-support/fake-change-log.js";
import { FakeOfflineAuthorizationCodeRequests } from "./test-support/fake-offline-authorization-code-requests.js";

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

function pull(
  changeLog: FakeChangeLog,
  since: number,
  {
    now = NOW,
    offlineAuthorizationCodes = new FakeOfflineAuthorizationCodeRequests(),
  }: { now?: Date; offlineAuthorizationCodes?: FakeOfflineAuthorizationCodeRequests } = {},
) {
  return pullChanges(
    { changeLog, offlineAuthorizationCodes, clock: { now: () => now } },
    { deviceId: DEVICE, since },
  );
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

  describe("the current fortnight's offline authorization code", () => {
    const CURRENT_FORTNIGHT = { start: "2026-09-16", end: "2026-09-30" };

    function codesOfARegisterWithAnOfflinePointOfSale(operations: string[] = []) {
      const codes = new FakeOfflineAuthorizationCodeRequests(operations);
      codes.installationsWithOfflinePointOfSale = [DEVICE];
      return codes;
    }

    it("is requested when the register has an offline point of sale and the cloud holds no code for the fortnight it is in", async () => {
      const offlineAuthorizationCodes = codesOfARegisterWithAnOfflinePointOfSale();

      await pull(fakeChangeLog([]), 0, { offlineAuthorizationCodes });

      expect(offlineAuthorizationCodes.heldCodeQuestions).toEqual([CURRENT_FORTNIGHT]);
      expect(offlineAuthorizationCodes.requests).toBe(1);
    });

    it("is not requested when the cloud holds it, since the same pull delivers it", async () => {
      const offlineAuthorizationCodes = codesOfARegisterWithAnOfflinePointOfSale();
      offlineAuthorizationCodes.heldFortnights = [CURRENT_FORTNIGHT];

      await pull(fakeChangeLog([]), 0, { offlineAuthorizationCodes });

      expect(offlineAuthorizationCodes.requests).toBe(0);
    });

    it("is not considered held because the cloud holds another fortnight's code", async () => {
      const offlineAuthorizationCodes = codesOfARegisterWithAnOfflinePointOfSale();
      offlineAuthorizationCodes.heldFortnights = [{ start: "2026-10-01", end: "2026-10-15" }];

      await pull(fakeChangeLog([]), 0, { offlineAuthorizationCodes });

      expect(offlineAuthorizationCodes.requests).toBe(1);
    });

    it("is not requested for a register without an offline point of sale, which never holds a code", async () => {
      const offlineAuthorizationCodes = new FakeOfflineAuthorizationCodeRequests();

      await pull(fakeChangeLog([]), 0, { offlineAuthorizationCodes });

      expect(offlineAuthorizationCodes.requests).toBe(0);
    });

    it("is requested first thing on a reconnection, before the pull's transaction opens to read the changes", async () => {
      const changeLog = fakeChangeLog(changesFor(BRANCH, 1, 2));
      const offlineAuthorizationCodes = codesOfARegisterWithAnOfflinePointOfSale(
        changeLog.operations,
      );

      await pull(changeLog, 0, { offlineAuthorizationCodes });

      expect(changeLog.operations).toEqual([
        "installedRegisterHasOfflinePointOfSale",
        "holdsOfflineAuthorizationCodeFor",
        "requestOfflineAuthorizationCode",
        "transaction",
        "recordObservedPull",
        "pullingRegister",
        "changesAfter",
      ]);
    });

    it.each([
      ["2026-10-16T01:00:00.000Z", { start: "2026-10-01", end: "2026-10-15" }],
      ["2026-10-16T03:00:00.000Z", { start: "2026-10-16", end: "2026-10-31" }],
    ])("is the one of the Argentina calendar day of %s", async (now, fortnight) => {
      const offlineAuthorizationCodes = codesOfARegisterWithAnOfflinePointOfSale();

      await pull(fakeChangeLog([]), 0, { now: new Date(now), offlineAuthorizationCodes });

      expect(offlineAuthorizationCodes.heldCodeQuestions).toEqual([fortnight]);
    });
  });
});
