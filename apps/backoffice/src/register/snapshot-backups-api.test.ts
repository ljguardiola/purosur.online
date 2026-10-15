import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  changeSnapshotLifecycleRules,
  fetchSnapshotBackupRegisters,
  fetchSnapshotBackups,
  rotateSnapshotKey,
} from "./snapshot-backups-api";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const backupsWire = {
  rules: { hourly: 24, daily: 30, monthly: 12 },
  tiers: { recent: 2, hourly: 1, daily: 0, monthly: 0 },
  generations: [
    {
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      created_at: "2026-10-14T15:55:00.000Z",
      size: 193_986_560,
      status: "verified",
      failure_reason: null,
      key_version: 2,
      counts_for_restore: true,
    },
    {
      id: "1a8fad5b-d9cb-469f-a165-70867728950e",
      created_at: "2026-10-14T15:50:00.000Z",
      size: 192_937_984,
      status: "failed",
      failure_reason: "hash_mismatch",
      key_version: 2,
      counts_for_restore: false,
    },
  ],
};

test("fetchSnapshotBackupRegisters lists the registers a person can choose", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { registers: [{ id: "register-1", name: "Caja 1" }] }),
  );

  expect(await fetchSnapshotBackupRegisters()).toEqual({
    kind: "ok",
    value: [{ id: "register-1", name: "Caja 1" }],
  });
  expect(fetch).toHaveBeenCalledWith("/api/snapshot-backups/registers");
});

test("fetchSnapshotBackupRegisters fails on a body that does not match its shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: "register-1" }]));

  expect(await fetchSnapshotBackupRegisters()).toEqual({ kind: "failed" });
});

test.each([
  [401, undefined, { kind: "unauthenticated" }],
  [403, undefined, { kind: "forbidden" }],
  [429, { "Retry-After": "45" }, { kind: "rate_limited", retryAfterSeconds: 45 }],
  [429, undefined, { kind: "failed" }],
  [500, undefined, { kind: "failed" }],
])("both reads answer %s (retry header %j) as %j", async (status, headers, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, undefined, headers));

  expect(await fetchSnapshotBackupRegisters()).toEqual(outcome);
  expect(await fetchSnapshotBackups("register-1")).toEqual(outcome);
});

test("both reads fail when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchSnapshotBackupRegisters()).toEqual({ kind: "failed" });
  expect(await fetchSnapshotBackups("register-1")).toEqual({ kind: "failed" });
});

test("fetchSnapshotBackups reads a register's rules, tiers and generations", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, backupsWire));

  expect(await fetchSnapshotBackups("register-1")).toEqual({
    kind: "ok",
    value: {
      rules: { hourly: 24, daily: 30, monthly: 12 },
      tiers: { recent: 2, hourly: 1, daily: 0, monthly: 0 },
      generations: [
        {
          id: "0f8fad5b-d9cb-469f-a165-70867728950e",
          createdAt: "2026-10-14T15:55:00.000Z",
          size: 193_986_560,
          status: "verified",
          countsForRestore: true,
        },
        {
          id: "1a8fad5b-d9cb-469f-a165-70867728950e",
          createdAt: "2026-10-14T15:50:00.000Z",
          size: 192_937_984,
          status: "failed",
          countsForRestore: false,
        },
      ],
    },
  });
  expect(fetch).toHaveBeenCalledWith("/api/snapshot-backups/registers/register-1");
});

test("fetchSnapshotBackups fails on a register the cloud no longer knows", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "register_not_found" }));

  expect(await fetchSnapshotBackups("register-1")).toEqual({ kind: "failed" });
});

test("fetchSnapshotBackups fails on a body that does not match its shape", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...backupsWire, rules: { hourly: 24, daily: 30 } }),
  );

  expect(await fetchSnapshotBackups("register-1")).toEqual({ kind: "failed" });
});

const RULES = { hourly: 48, daily: 60, monthly: 6 };

test("changeSnapshotLifecycleRules sends the rules and returns the ones the cloud kept", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, RULES));

  expect(await changeSnapshotLifecycleRules(RULES)).toEqual({ kind: "ok", value: RULES });
  expect(fetch).toHaveBeenCalledWith("/api/snapshot-backups/lifecycle-rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(RULES),
  });
});

test("changeSnapshotLifecycleRules fails on an answer that does not match the rules' shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { hourly: 48 }));

  expect(await changeSnapshotLifecycleRules(RULES)).toEqual({ kind: "failed" });
});

test("changeSnapshotLifecycleRules names the field the cloud refused", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "daily" }] }),
  );

  expect(await changeSnapshotLifecycleRules(RULES)).toEqual({
    kind: "validation_failed",
    field: "daily",
  });
});

test.each([
  [401, { code: "authorization_required" }, undefined, { kind: "authorization_required" }],
  [401, { code: "unauthenticated" }, undefined, { kind: "unauthenticated" }],
  [403, undefined, undefined, { kind: "forbidden" }],
  [429, undefined, { "Retry-After": "20" }, { kind: "rate_limited", retryAfterSeconds: 20 }],
  [500, undefined, undefined, { kind: "failed" }],
])("both changes answer %s as %j", async (status, body, headers, outcome) => {
  vi.mocked(fetch).mockImplementation(async () => jsonResponse(status, body, headers));

  expect(await changeSnapshotLifecycleRules(RULES)).toEqual(outcome);
  expect(await rotateSnapshotKey("register-1")).toEqual(outcome);
});

test("both changes fail when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await changeSnapshotLifecycleRules(RULES)).toEqual({ kind: "failed" });
  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "failed" });
});

test("rotateSnapshotKey asks for a rotation and returns the key version now in use", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { key_version: 3 }));

  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "ok", value: { keyVersion: 3 } });
  expect(fetch).toHaveBeenCalledWith("/api/snapshot-backups/registers/register-1/key-rotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
});

test("rotateSnapshotKey fails on an answer that does not match its shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { key_version: "3" }));

  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "failed" });
});

test("rotateSnapshotKey tells a missing register from a register with no key yet", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "register_not_found" }));
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "no_key_yet" }));
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "something_else" }));

  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "not_found" });
  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "no_key_yet" });
  expect(await rotateSnapshotKey("register-1")).toEqual({ kind: "failed" });
});
