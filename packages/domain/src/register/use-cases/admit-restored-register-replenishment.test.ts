import { describe, expect, it } from "vitest";
import { admitRestoredRegisterReplenishment } from "./admit-restored-register-replenishment.js";
import { FakeRestoredRegisterPredecessors } from "./test-support/fake-restored-register-predecessors.js";

const REGISTER = "register-1";
const PREDECESSOR = "device-old";
const INPUT = { registerId: REGISTER, predecessorDeviceId: PREDECESSOR };

function aRevokedPredecessor() {
  const predecessors = new FakeRestoredRegisterPredecessors();
  predecessors.standings.set(`${REGISTER}/${PREDECESSOR}`, "revoked");
  return predecessors;
}

describe("admitRestoredRegisterReplenishment", () => {
  it("refuses a predecessor that is not an installation of the register, or unknown", async () => {
    const predecessors = new FakeRestoredRegisterPredecessors();

    const outcome = await admitRestoredRegisterReplenishment({ predecessors }, INPUT);

    expect(outcome).toEqual({ kind: "predecessor_not_of_register" });
  });

  it("refuses a predecessor of the register that is not revoked", async () => {
    const predecessors = new FakeRestoredRegisterPredecessors();
    predecessors.standings.set(`${REGISTER}/${PREDECESSOR}`, "not_revoked");

    const outcome = await admitRestoredRegisterReplenishment({ predecessors }, INPUT);

    expect(outcome).toEqual({ kind: "predecessor_not_revoked" });
  });

  it("admits a revoked predecessor of the register", async () => {
    const predecessors = aRevokedPredecessor();

    const outcome = await admitRestoredRegisterReplenishment({ predecessors }, INPUT);

    expect(outcome).toEqual({ kind: "admitted" });
    expect(predecessors.cursorChecks).toEqual([]);
  });

  it("admits a cursor that names an installation of the replenishment", async () => {
    const predecessors = aRevokedPredecessor();

    const outcome = await admitRestoredRegisterReplenishment(
      { predecessors },
      { ...INPUT, cursorDeviceId: "device-newer" },
    );

    expect(outcome).toEqual({ kind: "admitted" });
    expect(predecessors.cursorChecks).toEqual([
      { registerId: REGISTER, predecessorDeviceId: PREDECESSOR, cursorDeviceId: "device-newer" },
    ]);
  });

  it("refuses a cursor that names an installation outside the replenishment", async () => {
    const predecessors = aRevokedPredecessor();
    predecessors.refusedCursorDeviceIds.add("device-elsewhere");

    const outcome = await admitRestoredRegisterReplenishment(
      { predecessors },
      { ...INPUT, cursorDeviceId: "device-elsewhere" },
    );

    expect(outcome).toEqual({ kind: "cursor_not_of_replenishment" });
  });

  it("checks no cursor of a predecessor it refuses", async () => {
    const predecessors = new FakeRestoredRegisterPredecessors();
    predecessors.standings.set(`${REGISTER}/${PREDECESSOR}`, "not_revoked");

    await admitRestoredRegisterReplenishment(
      { predecessors },
      { ...INPUT, cursorDeviceId: "device-newer" },
    );

    expect(predecessors.cursorChecks).toEqual([]);
  });
});
