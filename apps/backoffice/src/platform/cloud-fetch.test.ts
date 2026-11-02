import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCloudFetch } from "./cloud-fetch";
import { createReleaseMonitor } from "./release-monitor";

function monitorRunning(release: string) {
  return createReleaseMonitor({ running: release, readDeployedRelease: vi.fn() });
}

function responseNaming(
  release: string | undefined,
  init: ResponseInit,
  body: BodyInit | null = null,
) {
  return new Response(body, {
    ...init,
    headers: release === undefined ? {} : { "X-Purosur-Release": release },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sends the request it is given and answers the response", async () => {
  const response = responseNaming("aaa", { status: 200 });
  vi.mocked(fetch).mockResolvedValue(response);

  const answered = await createCloudFetch(monitorRunning("aaa"))("/api/thing", { method: "POST" });

  expect(answered).toBe(response);
  expect(fetch).toHaveBeenCalledWith("/api/thing", { method: "POST" });
});

test.each([200, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503])(
  "a response with %i naming another deployed release makes the tab outdated before it is answered",
  async (status) => {
    const monitor = monitorRunning("aaa");
    vi.mocked(fetch).mockResolvedValue(responseNaming("bbb", { status }));

    await createCloudFetch(monitor)("/api/thing");

    expect(monitor.outdated()).toBe(true);
  },
);

test("a success whose body the tab's release no longer reads is answered to a tab already outdated", async () => {
  const monitor = monitorRunning("aaa");
  vi.mocked(fetch).mockResolvedValue(
    responseNaming("bbb", { status: 200 }, JSON.stringify({ renamedField: 1 })),
  );

  const answered = await createCloudFetch(monitor)("/api/thing");

  expect(monitor.outdated()).toBe(true);
  expect(await answered.json()).toEqual({ renamedField: 1 });
});

test("a response naming the release the tab runs leaves it current", async () => {
  const monitor = monitorRunning("aaa");
  vi.mocked(fetch).mockResolvedValue(responseNaming("aaa", { status: 400 }));

  await createCloudFetch(monitor)("/api/thing");

  expect(monitor.outdated()).toBe(false);
});

test("a response that names no release leaves the tab as it was", async () => {
  const monitor = monitorRunning("aaa");
  vi.mocked(fetch).mockResolvedValue(responseNaming(undefined, { status: 400 }));

  await createCloudFetch(monitor)("/api/thing");

  expect(monitor.outdated()).toBe(false);
});

test("a refused response is answered without waiting for any other request", async () => {
  const neverRead = new Promise<string | undefined>(() => {});
  const monitor = createReleaseMonitor({ running: "aaa", readDeployedRelease: () => neverRead });
  const response = responseNaming(undefined, { status: 400 });
  vi.mocked(fetch).mockResolvedValue(response);

  const answered = await createCloudFetch(monitor)("/api/thing");

  expect(answered).toBe(response);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a failed network request propagates unchanged", async () => {
  const failure = new TypeError("offline");
  vi.mocked(fetch).mockRejectedValue(failure);
  const monitor = monitorRunning("aaa");

  await expect(createCloudFetch(monitor)("/api/thing")).rejects.toBe(failure);
  expect(monitor.outdated()).toBe(false);
});
