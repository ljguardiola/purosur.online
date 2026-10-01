import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wireInEffect = { id: "threshold-1", amount: 1_000_000, valid_from: "2026-01-01" };
const wireScheduled = { id: "threshold-2", amount: 1_500_000, valid_from: "2026-10-01" };

const wireOverview = {
  in_effect: wireInEffect,
  scheduled: wireScheduled,
  latest_valid_from: "2026-10-01",
};

const inEffect = { id: "threshold-1", amount: 1_000_000, validFrom: "2026-01-01" };
const scheduled = { id: "threshold-2", amount: 1_500_000, validFrom: "2026-10-01" };

const recordInput = { amount: 1_500_000, valid_from: "2026-10-01" };

test("fetchBuyerIdentificationThresholds returns the threshold in effect, the scheduled one and the newest start", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, wireOverview));

  const outcome = await fetchBuyerIdentificationThresholds();

  expect(outcome).toEqual({
    kind: "ok",
    value: { inEffect, scheduled, latestValidFrom: "2026-10-01" },
  });
  expect(fetch).toHaveBeenCalledWith("/api/buyer-identification-thresholds");
});

test("fetchBuyerIdentificationThresholds returns nothing in effect, scheduled or started when none was loaded", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { in_effect: null, scheduled: null, latest_valid_from: null }),
  );

  expect(await fetchBuyerIdentificationThresholds()).toEqual({
    kind: "ok",
    value: { inEffect: null, scheduled: null, latestValidFrom: null },
  });
});

test.each([
  ["a body that is not an overview", [wireInEffect]],
  ["an overview missing its newest start", { in_effect: null, scheduled: null }],
  [
    "an in-effect threshold missing its amount",
    { ...wireOverview, in_effect: { id: "threshold-1", valid_from: "2026-01-01" } },
  ],
  [
    "an in-effect threshold with a fractional amount",
    { ...wireOverview, in_effect: { ...wireInEffect, amount: 10.5 } },
  ],
])("fetchBuyerIdentificationThresholds returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "failed" });
});

test("fetchBuyerIdentificationThresholds returns failed on 200 with a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "failed" });
});

test("fetchBuyerIdentificationThresholds returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "unauthenticated" });
});

test("fetchBuyerIdentificationThresholds returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "forbidden" });
});

test("fetchBuyerIdentificationThresholds returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchBuyerIdentificationThresholds()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("fetchBuyerIdentificationThresholds returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "failed" });
});

test("fetchBuyerIdentificationThresholds returns failed on an unexpected status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchBuyerIdentificationThresholds()).toEqual({ kind: "failed" });
});

test("recordBuyerIdentificationThreshold POSTs the amount in cents and the day it starts, and returns the recorded threshold", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, wireScheduled));

  const outcome = await recordBuyerIdentificationThreshold(recordInput);

  expect(outcome).toEqual({ kind: "ok", value: scheduled });
  expect(fetch).toHaveBeenCalledWith("/api/buyer-identification-thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recordInput),
  });
});

test.each([
  ["a body that does not match a threshold", jsonResponse(201, { id: "threshold-2" })],
  ["no body", jsonResponse(201)],
  ["a body that is not JSON", new Response("<html>", { status: 201 })],
])("recordBuyerIdentificationThreshold returns failed on 201 with %s", async (_name, response) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "failed" });
});

test("recordBuyerIdentificationThreshold maps a 400 validation_failed to its field", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "amount must be a positive integer number of cents",
      details: [{ field: "amount" }],
    }),
  );

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({
    kind: "validation_failed",
    field: "amount",
  });
});

test("recordBuyerIdentificationThreshold returns failed on a 400 that names no field", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "failed" });
});

test("recordBuyerIdentificationThreshold returns not_after_latest on a 409 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, {
      code: "threshold_not_after_latest",
      message: "a threshold must start after the latest one, which starts on 2026-10-01",
      details: [{ field: "valid_from" }],
    }),
  );

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({
    kind: "not_after_latest",
  });
});

test("recordBuyerIdentificationThreshold returns failed on a 409 with another code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "failed" });
});

test("recordBuyerIdentificationThreshold returns authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({
    kind: "authorization_required",
  });
});

test("recordBuyerIdentificationThreshold returns unauthenticated on a 401 with no authorization_required code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({
    kind: "unauthenticated",
  });
});

test("recordBuyerIdentificationThreshold returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "forbidden" });
});

test("recordBuyerIdentificationThreshold returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "failed" });
});

test("recordBuyerIdentificationThreshold returns failed on an unexpected status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await recordBuyerIdentificationThreshold(recordInput)).toEqual({ kind: "failed" });
});
