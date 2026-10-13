import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registers } from "../shell/test-support/report-fixtures";
import { fetchReportRegisters } from "./report-registers-api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the registers of the branch", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(registers)));

  expect(await fetchReportRegisters()).toEqual({ kind: "ok", value: registers });
  expect(fetch).toHaveBeenCalledWith("/api/reports/registers");
});

test("treats a body that does not match the list as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ registers: [{ id: "x" }] })));

  expect(await fetchReportRegisters()).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchReportRegisters()).toEqual({ kind: "forbidden" });
});
