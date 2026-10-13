import { test } from "vitest";
import { launchedRegisters } from "./launched-registers";
import { failureReport } from "./register-failure-report";

test.afterAll((_context, file) => {
  const report = failureReport(file, launchedRegisters());
  if (report !== undefined) {
    console.error(report);
  }
});
