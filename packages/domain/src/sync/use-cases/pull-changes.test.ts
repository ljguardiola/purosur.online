import { describe, expect, it } from "vitest";
import { pullChanges } from "./pull-changes.js";
import { FakeChangeLog, type FakeLoggedChange } from "./test-support/fake-change-log.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const BRANCH = "branch-a";
const OTHER_BRANCH = "branch-b";
const DEVICE = "device-1";

function changesFor(locationId: string, firstSeq: number, count: number): FakeLoggedChange[] {
  return Array.from({ length: count }, (_, index) => ({
    changeSeq: firstSeq + index,
    locationId,
  }));
}

function pull(changeLog: FakeChangeLog, since: number) {
  return pullChanges(
    { changeLog, clock: { now: () => NOW } },
    { deviceId: DEVICE, locationId: BRANCH, since },
  );
}

describe("pulling changes", () => {
  it("gives a brand-new installation every change of its branch from the very first one", async () => {
    const changeLog = new FakeChangeLog([
      ...changesFor(BRANCH, 1, 2),
      ...changesFor(OTHER_BRANCH, 3, 1),
      ...changesFor(BRANCH, 4, 1),
    ]);

    const page = await pull(changeLog, 0);

    expect(page).toEqual({
      changes: [...changesFor(BRANCH, 1, 2), ...changesFor(BRANCH, 4, 1)],
      cursor: 4,
      hasMore: false,
    });
  });

  it("gives only the changes after the cursor it is asked from", async () => {
    const changeLog = new FakeChangeLog(changesFor(BRANCH, 1, 5));

    const page = await pull(changeLog, 3);

    expect(page).toEqual({ changes: changesFor(BRANCH, 4, 2), cursor: 5, hasMore: false });
  });

  it("gives 500 changes and says more wait when more than 500 do", async () => {
    const changeLog = new FakeChangeLog(changesFor(BRANCH, 1, 1_200));

    const page = await pull(changeLog, 0);

    expect(page).toEqual({ changes: changesFor(BRANCH, 1, 500), cursor: 500, hasMore: true });
    expect(changeLog.readRequests).toEqual([{ locationId: BRANCH, since: 0, limit: 501 }]);
  });

  it("keeps the cursor when nothing is left", async () => {
    const changeLog = new FakeChangeLog(changesFor(BRANCH, 1, 3));

    expect(await pull(changeLog, 3)).toEqual({ changes: [], cursor: 3, hasMore: false });
  });

  it("records the cursor the device asked from and when it asked, replacing the previous one", async () => {
    const changeLog = new FakeChangeLog(changesFor(BRANCH, 1, 3));

    await pull(changeLog, 0);
    await pull(changeLog, 3);

    expect(changeLog.state.observedPulls).toEqual([{ deviceId: DEVICE, since: 3, at: NOW }]);
  });

  it("records nothing when the changes could not be read", async () => {
    const changeLog = new FakeChangeLog(changesFor(BRANCH, 1, 3));
    changeLog.failReading = true;

    await expect(pull(changeLog, 0)).rejects.toThrow("the change log could not be read");
    expect(changeLog.state.observedPulls).toEqual([]);
  });
});
