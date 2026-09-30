import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchErrorReportingConfiguration } from "./error-reporting-configuration-api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const enabled = {
  enabled: true,
  dsn: "https://key@errors.example.test/1",
  environment: "staging",
  release: "abc1234",
};

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

test("reads the configuration the cloud answers", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, enabled));

  expect(await fetchErrorReportingConfiguration()).toEqual(enabled);
  expect(fetch).toHaveBeenCalledWith("/api/error-reporting");
});

test("reads that reporting is off", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { enabled: false }));

  expect(await fetchErrorReportingConfiguration()).toEqual({ enabled: false });
});

test("treats reporting as off when the cloud cannot be reached", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

  expect(await fetchErrorReportingConfiguration()).toEqual({ enabled: false });
});

test("treats reporting as off when the cloud answers an error", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchErrorReportingConfiguration()).toEqual({ enabled: false });
});

test.each([
  ["not JSON", new Response("<html>", { status: 200 })],
  ["missing its DSN", jsonResponse(200, { ...enabled, dsn: undefined })],
  ["missing its release", jsonResponse(200, { ...enabled, release: 7 })],
  ["not an object", jsonResponse(200, "on")],
])("treats reporting as off when the answer is %s", async (_name, response) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await fetchErrorReportingConfiguration()).toEqual({ enabled: false });
});
