import { describe, expect, it } from "vitest";
import { askContingencyTicketRecovery } from "./ask-contingency-ticket-recovery.js";
import { finishContingencyTicketRecovery } from "./finish-contingency-ticket-recovery.js";
import { FakeContingencyTicketRecoveries } from "./test-support/fake-contingency-ticket-recoveries.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const ASKING = { registerId: "register-1", restoredDeviceId: "device-2" };

function setup() {
  const recoveries = new FakeContingencyTicketRecoveries();
  return { recoveries, ports: { recoveries, clock: { now: () => NOW } } };
}

describe("asking for the contingency ticket recovery of a restored installation", () => {
  it("opens the recovery when the installation has none and answers that it awaits", async () => {
    const { ports, recoveries } = setup();
    recoveries.registerNames.set("register-1", "Caja 1");

    const outcome = await askContingencyTicketRecovery(ports, ASKING);

    expect(outcome).toEqual({ kind: "awaiting" });
    expect(await recoveries.awaiting()).toEqual([
      { recoveryId: "recovery-1", registerId: "register-1", registerName: "Caja 1", openedAt: NOW },
    ]);
  });

  it("opens the recovery and answers in a single transaction", async () => {
    const { ports, recoveries } = setup();

    await askContingencyTicketRecovery(ports, ASKING);

    expect(recoveries.transactions).toBe(1);
  });

  it("opens one recovery however many times the installation asks", async () => {
    const { ports, recoveries } = setup();

    await askContingencyTicketRecovery(ports, ASKING);
    const outcome = await askContingencyTicketRecovery(ports, ASKING);

    expect(outcome).toEqual({ kind: "awaiting" });
    expect(recoveries.recoveries).toHaveLength(1);
  });

  it("opens a recovery for each restored installation", async () => {
    const { ports, recoveries } = setup();

    await askContingencyTicketRecovery(ports, ASKING);
    await askContingencyTicketRecovery(ports, { ...ASKING, restoredDeviceId: "device-3" });

    expect(recoveries.recoveries).toHaveLength(2);
  });

  it("answers that the recovery is finished once someone finished it", async () => {
    const { ports } = setup();
    await askContingencyTicketRecovery(ports, ASKING);
    await finishContingencyTicketRecovery(ports, {
      recoveryId: "recovery-1",
      finishedBy: "user-1",
    });

    const outcome = await askContingencyTicketRecovery(ports, ASKING);

    expect(outcome).toEqual({ kind: "finished" });
  });

  it("leaves no recovery behind when the operation fails", async () => {
    const { ports, recoveries } = setup();
    recoveries.failAfterOpening = true;

    await expect(askContingencyTicketRecovery(ports, ASKING)).rejects.toThrow(
      "storage unavailable",
    );

    expect(recoveries.recoveries).toEqual([]);
  });
});
