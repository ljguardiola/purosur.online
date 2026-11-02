import { describe, expectTypeOf, it } from "vitest";
import type { ContingencyReportingStartedFact } from "./contingency-facts.js";

describe("ContingencyReportingStartedFact", () => {
  it("always says whether the register has been recording since its enrollment", () => {
    expectTypeOf<{ since: Date }>().not.toExtend<ContingencyReportingStartedFact>();
  });
});
