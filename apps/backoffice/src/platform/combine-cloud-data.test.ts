import { expect, test, vi } from "vitest";
import { combineCloudData } from "./combine-cloud-data";
import type { CloudData } from "./use-cloud-query";

const loaded = <T>(value: T, refreshing = false): CloudData<T> => ({
  status: "loaded",
  value,
  refreshing,
});
const loading: CloudData<never> = { status: "loading" };
const failed = (retry: () => void, retryAfterSeconds?: number): CloudData<never> => ({
  status: "failed",
  retry,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

test("loaded when both are loaded, holding both values in order", () => {
  expect(combineCloudData(loaded("a"), loaded(2))).toEqual({
    status: "loaded",
    value: ["a", 2],
    refreshing: false,
  });
});

test("loaded but refreshing when either one is refreshing", () => {
  expect(combineCloudData(loaded("a"), loaded(2, true))).toMatchObject({ refreshing: true });
  expect(combineCloudData(loaded("a", true), loaded(2))).toMatchObject({ refreshing: true });
});

test("loading when either one is loading, even if the other failed", () => {
  expect(combineCloudData(loading, loaded(2))).toEqual({ status: "loading" });
  expect(combineCloudData(loaded("a"), loading)).toEqual({ status: "loading" });
  expect(
    combineCloudData(
      failed(() => {}),
      loading,
    ),
  ).toEqual({ status: "loading" });
});

test("failed when either one failed, retrying only the ones that failed", () => {
  const retryFirst = vi.fn();
  const retrySecond = vi.fn();

  const onlyFirst = combineCloudData(failed(retryFirst), loaded(2));
  expect(onlyFirst.status).toBe("failed");
  if (onlyFirst.status === "failed") {
    onlyFirst.retry();
  }
  expect(retryFirst).toHaveBeenCalledTimes(1);

  const both = combineCloudData(failed(retryFirst), failed(retrySecond));
  if (both.status === "failed") {
    both.retry();
  }
  expect(retryFirst).toHaveBeenCalledTimes(2);
  expect(retrySecond).toHaveBeenCalledTimes(1);
});

test("a failure that names a wait time keeps the longest one", () => {
  expect(
    combineCloudData(
      failed(() => {}, 60),
      failed(() => {}, 300),
    ),
  ).toMatchObject({
    retryAfterSeconds: 300,
  });
  expect(
    combineCloudData(
      failed(() => {}, 300),
      failed(() => {}, 60),
    ),
  ).toMatchObject({
    retryAfterSeconds: 300,
  });
  expect(
    combineCloudData(
      failed(() => {}),
      failed(() => {}, 60),
    ),
  ).toMatchObject({
    retryAfterSeconds: 60,
  });
});

test("a failure that names no wait time names none", () => {
  expect(
    combineCloudData(
      failed(() => {}),
      loaded(2),
    ),
  ).not.toHaveProperty("retryAfterSeconds");
});
