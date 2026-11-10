import type { FiscalEmissionMode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { readEmittingInContingencyTime } from "./contingency-time-read";

describe("readEmittingInContingencyTime", () => {
  it.each<[string, FiscalEmissionMode, boolean]>([
    [
      "issuing offline for lack of connectivity",
      { kind: "offline_code", cause: "no_connectivity" },
      true,
    ],
    ["issuing in real time", { kind: "real_time" }, false],
    ["deferring", { kind: "deferring", reason: "fiscally_offline" }, false],
  ])("answers whether the register %s emits in contingency time", (_, mode, expected) => {
    expect(readEmittingInContingencyTime(() => mode)).toBe(expected);
  });
});
