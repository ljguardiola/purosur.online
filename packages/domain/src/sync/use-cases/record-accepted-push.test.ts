import { describe, expect, it } from "vitest";
import { recordAcceptedPush } from "./record-accepted-push.js";
import { FakeAcceptedPushLog } from "./test-support/fake-accepted-push-log.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const clock = { now: () => NOW };

describe("recording an accepted push", () => {
  it("stores the instant the clock gives", async () => {
    const log = new FakeAcceptedPushLog();

    await recordAcceptedPush({ log, clock });

    expect(log.recorded).toEqual([NOW]);
  });

  it("stores each acceptance, the later ones after the earlier", async () => {
    const log = new FakeAcceptedPushLog();
    const later = new Date(NOW.getTime() + 60_000);

    await recordAcceptedPush({ log, clock });
    await recordAcceptedPush({ log, clock: { now: () => later } });

    expect(log.recorded).toEqual([NOW, later]);
  });

  it("lets the log's failure reach the caller", async () => {
    const log = new FakeAcceptedPushLog();
    log.failWith = new Error("disk full");

    await expect(recordAcceptedPush({ log, clock })).rejects.toThrow("disk full");
  });
});
