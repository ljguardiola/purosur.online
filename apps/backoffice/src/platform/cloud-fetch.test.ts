import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCloudFetch } from "./cloud-fetch";
import type { createReleaseMonitor } from "./release-monitor";

type Monitor = Pick<ReturnType<typeof createReleaseMonitor>, "check">;

function monitorChecking(order: string[]): Monitor {
  return {
    check: vi.fn(async () => {
      order.push("checked");
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sends the request it is given and answers the response", async () => {
  const response = new Response(null, { status: 200 });
  vi.mocked(fetch).mockResolvedValue(response);
  const monitor = monitorChecking([]);

  const answered = await createCloudFetch(monitor)("/api/thing", { method: "POST" });

  expect(answered).toBe(response);
  expect(fetch).toHaveBeenCalledWith("/api/thing", { method: "POST" });
  expect(monitor.check).not.toHaveBeenCalled();
});

test.each([
  400, 404, 409, 422, 500,
])("a response refused with %i is answered only after the tab has checked its release", async (status) => {
  const order: string[] = [];
  const response = new Response(null, { status });
  vi.mocked(fetch).mockImplementation(async () => {
    order.push("responded");
    return response;
  });

  const answered = await createCloudFetch(monitorChecking(order))("/api/thing");
  order.push("answered");

  expect(answered).toBe(response);
  expect(order).toEqual(["responded", "checked", "answered"]);
});

test.each([401, 403, 429])("a response refused with %i does not make the tab check", async (status) => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
  const monitor = monitorChecking([]);

  await createCloudFetch(monitor)("/api/thing");

  expect(monitor.check).not.toHaveBeenCalled();
});

test("a failed network request propagates unchanged", async () => {
  const failure = new TypeError("offline");
  vi.mocked(fetch).mockRejectedValue(failure);
  const monitor = monitorChecking([]);

  await expect(createCloudFetch(monitor)("/api/thing")).rejects.toBe(failure);
  expect(monitor.check).not.toHaveBeenCalled();
});
