import { describe, expect, it } from "vitest";
import { countsAsContingencyTime } from "./contingency-time.js";
import {
  DEFERRAL_REASONS,
  OFFLINE_AUTHORIZATION_CAUSES,
} from "./real-time-authorization.js";

describe("countsAsContingencyTime", () => {
  it("does not count while the register authorizes in real time", () => {
    expect(countsAsContingencyTime({ kind: "real_time" })).toBe(false);
  });

  it("counts while the register issues offline because it has no connectivity", () => {
    expect(countsAsContingencyTime({ kind: "offline_code", cause: "no_connectivity" })).toBe(true);
  });

  it.each(OFFLINE_AUTHORIZATION_CAUSES.filter((cause) => cause !== "no_connectivity"))(
    "does not count while the register issues offline because of %s",
    (cause) => {
      expect(countsAsContingencyTime({ kind: "offline_code", cause })).toBe(false);
    },
  );

  it.each(DEFERRAL_REASONS)("does not count while the register defers for %s", (reason) => {
    expect(countsAsContingencyTime({ kind: "deferring", reason })).toBe(false);
  });
});
