import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type BranchSettings,
  fetchBranchSettings,
  saveBranchSettings,
} from "./branch-settings-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wireRow = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "+54 9 11 3333-2211",
  instagram_handle: "@purosur.dietetica",
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
  monday_hours: [
    { opens_at: "09:00", closes_at: "13:00" },
    { opens_at: "17:00", closes_at: "21:00" },
  ],
  tuesday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  wednesday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  thursday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  friday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  saturday_hours: [{ opens_at: "09:00", closes_at: "13:30" }],
  sunday_hours: [],
};

const settings: BranchSettings = {
  address: "Av. Belgrano 1450, CABA",
  whatsappNumber: "+54 9 11 3333-2211",
  instagramHandle: "@purosur.dietetica",
  hours: {
    monday: [
      { opensAt: "09:00", closesAt: "13:00" },
      { opensAt: "17:00", closesAt: "21:00" },
    ],
    tuesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    wednesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    thursday: [{ opensAt: "09:00", closesAt: "20:00" }],
    friday: [{ opensAt: "09:00", closesAt: "20:00" }],
    saturday: [{ opensAt: "09:00", closesAt: "13:30" }],
    sunday: [],
  },
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
  version: 1,
};

test("fetchBranchSettings returns the branch's settings on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, wireRow));

  const outcome = await fetchBranchSettings();

  expect(outcome).toEqual({ kind: "ok", value: settings });
  expect(fetch).toHaveBeenCalledWith("/branch-settings");
});

test.each([
  ["a body missing a field", { ...wireRow, version: undefined }],
  ["a body with a mistyped field", { ...wireRow, expiring_lot_alert_days: "30" }],
  ["a body with a malformed range", { ...wireRow, monday_hours: [{ opens_at: "09:00" }] }],
  ["a body that is not an object", []],
])("fetchBranchSettings returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("fetchBranchSettings returns failed on 200 with a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("fetchBranchSettings returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchBranchSettings()).toEqual({ kind: "unauthenticated" });
});

test("fetchBranchSettings returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchBranchSettings()).toEqual({ kind: "forbidden" });
});

test("fetchBranchSettings returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchBranchSettings()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchBranchSettings returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("fetchBranchSettings returns failed on an unexpected status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("saveBranchSettings PUTs every field, each day's ranges in order, and the version", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...wireRow, version: 2 }));

  const outcome = await saveBranchSettings(wireRow);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/branch-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireRow),
  });
});

test.each([
  ["a body that does not match the settings", jsonResponse(200, { version: "2" })],
  ["no body", jsonResponse(204)],
  ["a body that is not JSON", new Response("<html>", { status: 200 })],
])("saveBranchSettings returns ok on any 2xx, even with %s", async (_name, response) => {
  vi.mocked(fetch).mockResolvedValue(response);

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "ok" });
});

test("saveBranchSettings maps a 400 validation_failed to its day field", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message:
        "monday_hours must be a list of at most 6 non-overlapping HH:MM opens_at/closes_at ranges, each with closes_at later",
      details: [{ field: "monday_hours" }],
    }),
  );

  expect(await saveBranchSettings(wireRow)).toEqual({
    kind: "validation_failed",
    field: "monday_hours",
  });
});

test("saveBranchSettings reports the wire name of whichever field the cloud refused", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "address" }] }),
  );
  expect(await saveBranchSettings(wireRow)).toEqual({
    kind: "validation_failed",
    field: "address",
  });

  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "branch_id" }] }),
  );
  expect(await saveBranchSettings(wireRow)).toEqual({
    kind: "validation_failed",
    field: "branch_id",
  });
});

test("saveBranchSettings returns failed on a 400 that names no field", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "failed" });
});

test("saveBranchSettings returns stale_version on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "stale_version" });
});

test("saveBranchSettings returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "forbidden" });
});

test("saveBranchSettings returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "unauthenticated" });
});

test("saveBranchSettings returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await saveBranchSettings(wireRow)).toEqual({ kind: "failed" });
});
