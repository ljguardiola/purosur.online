import { afterAll } from "vitest";
import { launchedRegisters } from "./launched-registers";
import { failureReport } from "./register-failure-report";

afterAll((file) => {
  const report = failureReport(file, launchedRegisters());
  if (report !== undefined) {
    console.error(report);
  }
});
