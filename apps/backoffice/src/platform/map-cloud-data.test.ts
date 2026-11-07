import { expect, test, vi } from "vitest";
import { mapCloudData } from "./map-cloud-data";
import type { CloudData } from "./use-cloud-query";

test("maps a loaded value and keeps whether it is refreshing", () => {
  const loaded: CloudData<string[]> = { status: "loaded", value: ["a", "b"], refreshing: true };

  expect(mapCloudData(loaded, (items) => items.length)).toEqual({
    status: "loaded",
    value: 2,
    refreshing: true,
  });
});

test("stays loading while the value loads, without the previous value", () => {
  const loading: CloudData<string[]> = { status: "loading", lastValue: ["a"] };

  expect(mapCloudData(loading, (items) => items.length)).toEqual({ status: "loading" });
});

test("keeps a failure, its wait and its retry, without the previous value", () => {
  const retry = vi.fn();
  const failed: CloudData<string[]> = {
    status: "failed",
    retryAfterSeconds: 30,
    outdated: true,
    retry,
    lastValue: ["a"],
  };

  const mapped = mapCloudData(failed, (items) => items.length);

  expect(mapped).toEqual({ status: "failed", retryAfterSeconds: 30, outdated: true, retry });
});
