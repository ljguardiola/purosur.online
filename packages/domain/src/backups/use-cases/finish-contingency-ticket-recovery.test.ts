import { describe, expect, it } from "vitest";
import { askContingencyTicketRecovery } from "./ask-contingency-ticket-recovery.js";
import { finishContingencyTicketRecovery } from "./finish-contingency-ticket-recovery.js";
import { FakeContingencyTicketRecoveries } from "./test-support/fake-contingency-ticket-recoveries.js";

const OPENED_AT = new Date("2026-10-20T12:00:00.000Z");
const FINISHED_AT = new Date("2026-10-20T15:30:00.000Z");

async function setup() {
  const recoveries = new FakeContingencyTicketRecoveries();
  let now = OPENED_AT;
  const ports = { recoveries, clock: { now: () => now } };
  await askContingencyTicketRecovery(ports, {
    registerId: "register-1",
    restoredDeviceId: "device-2",
  });
  now = FINISHED_AT;
  return { recoveries, ports };
}

describe("finishing a contingency ticket recovery", () => {
  it("finishes the recovery, recording when and by whom", async () => {
    const { ports, recoveries } = await setup();

    const outcome = await finishContingencyTicketRecovery(ports, {
      recoveryId: "recovery-1",
      finishedBy: "user-1",
    });

    expect(outcome).toEqual({ kind: "finished" });
    expect(recoveries.recoveries[0]).toMatchObject({
      finishedAt: FINISHED_AT,
      finishedBy: "user-1",
    });
    expect(await recoveries.awaiting()).toEqual([]);
  });

  it("locks the recovery before reading it", async () => {
    const { ports, recoveries } = await setup();

    await finishContingencyTicketRecovery(ports, {
      recoveryId: "recovery-1",
      finishedBy: "user-1",
    });

    expect(recoveries.locked).toEqual(["recovery-1"]);
  });

  it("keeps the first finish when the recovery was already finished", async () => {
    const { ports, recoveries } = await setup();
    await finishContingencyTicketRecovery(ports, {
      recoveryId: "recovery-1",
      finishedBy: "user-1",
    });

    const outcome = await finishContingencyTicketRecovery(
      { ...ports, clock: { now: () => new Date("2026-10-21T00:00:00.000Z") } },
      { recoveryId: "recovery-1", finishedBy: "user-2" },
    );

    expect(outcome).toEqual({ kind: "already_finished" });
    expect(recoveries.recoveries[0]).toMatchObject({
      finishedAt: FINISHED_AT,
      finishedBy: "user-1",
    });
  });

  it("refuses a recovery that does not exist", async () => {
    const { ports } = await setup();

    const outcome = await finishContingencyTicketRecovery(ports, {
      recoveryId: "recovery-9",
      finishedBy: "user-1",
    });

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("leaves the recovery awaiting when recording the finish fails", async () => {
    const { ports, recoveries } = await setup();
    recoveries.failAfterFinishing = true;

    await expect(
      finishContingencyTicketRecovery(ports, { recoveryId: "recovery-1", finishedBy: "user-1" }),
    ).rejects.toThrow("storage unavailable");

    expect(await recoveries.awaiting()).toHaveLength(1);
  });
});
