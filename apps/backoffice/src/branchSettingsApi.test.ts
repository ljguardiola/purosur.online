import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type BranchSettings, fetchBranchSettings, saveBranchSettings } from "./branchSettingsApi";

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
  weekday_hours: { opens_at: "09:00", closes_at: "20:00" },
  saturday_hours: { opens_at: "09:00", closes_at: "13:30" },
  sunday_hours: null,
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
};

const settings: BranchSettings = {
  address: "Av. Belgrano 1450, CABA",
  whatsappNumber: "+54 9 11 3333-2211",
  instagramHandle: "@purosur.dietetica",
  weekdayHours: { opensAt: "09:00", closesAt: "20:00" },
  saturdayHours: { opensAt: "09:00", closesAt: "13:30" },
  sundayHours: null,
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

test("fetchBranchSettings returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchBranchSettings()).toEqual({ kind: "unauthenticated" });
});

test("fetchBranchSettings returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchBranchSettings()).toEqual({ kind: "forbidden" });
});

test("fetchBranchSettings returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("fetchBranchSettings returns failed on an unexpected status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchBranchSettings()).toEqual({ kind: "failed" });
});

test("saveBranchSettings PUTs every field and the version, returning the saved settings", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...wireRow, version: 2 }));

  const outcome = await saveBranchSettings(settings);

  expect(outcome).toEqual({ kind: "ok", value: { ...settings, version: 2 } });
  expect(fetch).toHaveBeenCalledWith("/branch-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wireRow),
  });
});

test("saveBranchSettings maps a 400 validation_failed to its field", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message:
        "weekday_hours must be null or an HH:MM opens_at/closes_at pair with closes_at later",
      details: [{ field: "weekday_hours" }],
    }),
  );

  expect(await saveBranchSettings(settings)).toEqual({
    kind: "validation_failed",
    field: "weekday_hours",
  });
});

test("saveBranchSettings returns stale_version on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  expect(await saveBranchSettings(settings)).toEqual({ kind: "stale_version" });
});

test("saveBranchSettings returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await saveBranchSettings(settings)).toEqual({ kind: "forbidden" });
});

test("saveBranchSettings returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await saveBranchSettings(settings)).toEqual({ kind: "unauthenticated" });
});

test("saveBranchSettings returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await saveBranchSettings(settings)).toEqual({ kind: "failed" });
});
