import { describe, expect, it } from "vitest";
import { recordRegisterSeenUnenrolled } from "./record-register-seen-unenrolled.js";
import { FakeContingencyLedger } from "./test-support/fake-contingency-ledger.js";

describe("recordRegisterSeenUnenrolled", () => {
  it("remembers that the register was seen before it was enrolled", () => {
    const ledger = new FakeContingencyLedger();

    expect(recordRegisterSeenUnenrolled({ ledger })).toEqual({ kind: "recorded" });
    expect(ledger.state.seenUnenrolled).toBe(true);
    expect(ledger.transactions).toBe(1);
  });

  it("writes nothing when it already remembers it", () => {
    const ledger = new FakeContingencyLedger({ seenUnenrolled: true });
    ledger.failOn = "recordSeenUnenrolled";

    expect(recordRegisterSeenUnenrolled({ ledger })).toEqual({ kind: "already_recorded" });
    expect(ledger.state.seenUnenrolled).toBe(true);
  });
});
