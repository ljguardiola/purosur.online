import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readDeployedRelease } from "./deployed-release-api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the release the cloud reports on its health check, bypassing the browser cache", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", version: "0f3a9c1d7b2e" })),
  );

  expect(await readDeployedRelease()).toBe("0f3a9c1d7b2e");
  expect(fetch).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
});

test("reports no release when the cloud refuses the health check", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));

  expect(await readDeployedRelease()).toBeUndefined();
});

test("reports no release when the answer is not a health check", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ version: 3 })));

  expect(await readDeployedRelease()).toBeUndefined();
});

test("reports no release when the answer is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html></html>"));

  expect(await readDeployedRelease()).toBeUndefined();
});

test("reports no release when the request fails", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await readDeployedRelease()).toBeUndefined();
});
