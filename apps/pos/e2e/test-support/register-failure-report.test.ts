import { describe, expect, it } from "vitest";
import { failureReport } from "./register-failure-report";

const passed = { result: { state: "pass" } };
const failed = { result: { state: "fail" } };

describe("the report of what the registers logged when a file fails", () => {
  it("has nothing to say when every test passed", () => {
    const file = { result: { state: "pass" }, tasks: [passed, { tasks: [passed] }] };

    expect(failureReport(file, [["main: started\n"]])).toBeUndefined();
  });

  it("shows what each register logged, labeled, when a test fails", () => {
    const file = { tasks: [passed, failed] };

    const report = failureReport(file, [["main: started\n", "core: ready\n"], ["main: again\n"]]);

    expect(report).toMatch(
      /register 1[\s\S]*main: started\ncore: ready\n[\s\S]*register 2[\s\S]*main: again\n/,
    );
  });

  it("shows the logs when a test nested in a suite fails", () => {
    const file = { tasks: [{ tasks: [passed, { tasks: [failed] }] }] };

    expect(failureReport(file, [["main: started\n"]])).toContain("main: started");
  });

  it("shows the logs when a hook of a suite fails and no test ran", () => {
    const file = {
      tasks: [{ result: { state: "fail", errors: [new Error("beforeAll failed")] }, tasks: [] }],
    };

    expect(failureReport(file, [["main: started\n"]])).toContain("main: started");
  });

  it("shows the logs when a hook of the file itself fails", () => {
    const file = {
      result: { state: "fail", errors: [new Error("afterAll failed")] },
      tasks: [passed],
    };

    expect(failureReport(file, [["main: started\n"]])).toContain("main: started");
  });

  it("says a register logged nothing when its logs are empty", () => {
    const report = failureReport({ tasks: [failed] }, [[]]);

    expect(report).toMatch(/register 1 logged nothing/);
  });

  it("has nothing to say when the file launched no register", () => {
    expect(failureReport({ tasks: [failed] }, [])).toBeUndefined();
  });
});
