import { cloudError, pushEventsRequestSchema } from "@purosur/contracts";
import type { RegisterTelemetry } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import {
  type DamagedRegisterReportDeps,
  pushDamagedRegisterReport,
} from "./push-damaged-register-report";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };
const TELEMETRY: RegisterTelemetry = {
  wal_size_bytes: 0,
  disk_free_bytes: 1000,
  disk_free_ratio: 0.5,
  sales_denied: true,
  sales_denied_reason: "local_database_damaged",
};

function cloudAnswering(response: CloudResponse) {
  const requests: { path: string; bearerToken: string; body: unknown }[] = [];
  const post = async (path: string, bearerToken: string, body: unknown) => {
    requests.push({ path, bearerToken, body: pushEventsRequestSchema.parse(body) });
    return response;
  };
  return { post, requests };
}

const RECEIVED: CloudResponse = { kind: "ok", body: { status: "ok", ack_seq: 7 } };

function depsWith(
  post: DamagedRegisterReportDeps["post"],
  overrides: Partial<DamagedRegisterReportDeps> = {},
): DamagedRegisterReportDeps {
  return {
    readCredentials: async () => CREDENTIALS,
    post,
    appVersion: "1.4.2",
    readTelemetry: async () => TELEMETRY,
    ...overrides,
  };
}

describe("the report of a register whose local database is damaged", () => {
  it("tells the cloud, with the device token, that it can't sell, and sends no event", async () => {
    const { post, requests } = cloudAnswering(RECEIVED);

    const attempt = await pushDamagedRegisterReport(depsWith(post));

    expect(attempt).toEqual({ kind: "up_to_date" });
    expect(requests).toEqual([
      {
        path: "/api/events",
        bearerToken: "prefix.secret",
        body: { app_version: "1.4.2", telemetry: TELEMETRY, events: [] },
      },
    ]);
  });

  it("is sent again on the next push when the cloud can't be reached", async () => {
    const { post } = cloudAnswering({ kind: "unreachable" });

    expect(await pushDamagedRegisterReport(depsWith(post))).toEqual({
      kind: "failed",
      failure: { kind: "unreachable" },
    });
  });

  it("reads that the cloud revoked the installation", async () => {
    const { post } = cloudAnswering({ kind: "error", error: cloudError("revoked", "Revocada") });

    expect(await pushDamagedRegisterReport(depsWith(post))).toEqual({ kind: "revoked" });
  });

  it("reads that the cloud asks the register to update", async () => {
    const { post } = cloudAnswering({
      kind: "ok",
      body: { status: "update_required", ack_seq: 7 },
    });

    expect(await pushDamagedRegisterReport(depsWith(post))).toEqual({ kind: "update_required" });
  });

  it("is not sent before the register is enrolled", async () => {
    const { post, requests } = cloudAnswering(RECEIVED);

    const attempt = await pushDamagedRegisterReport(
      depsWith(post, { readCredentials: async () => undefined }),
    );

    expect(attempt).toEqual({ kind: "not_enrolled" });
    expect(requests).toEqual([]);
  });

  it("is not sent when the channel has no cloud", async () => {
    expect(await pushDamagedRegisterReport(depsWith(undefined))).toEqual({ kind: "no_cloud" });
  });

  it("is not sent without the app's version", async () => {
    const { post, requests } = cloudAnswering(RECEIVED);

    const attempt = await pushDamagedRegisterReport(depsWith(post, { appVersion: undefined }));

    expect(attempt).toEqual({ kind: "no_app_version" });
    expect(requests).toEqual([]);
  });
});

describe("the cloud's answer to the report of a damaged register", () => {
  it("reads a gap with the sequence the cloud expects", async () => {
    const { post } = cloudAnswering({
      kind: "ok",
      body: { status: "expected_seq", ack_seq: 4, expected_seq: 5 },
    });

    expect(await pushDamagedRegisterReport(depsWith(post))).toEqual({
      kind: "gap",
      expectedSeq: 5,
    });
  });

  it("reads a stale device", async () => {
    const { post } = cloudAnswering({ kind: "ok", body: { status: "stale_device", ack_seq: 9 } });

    expect(await pushDamagedRegisterReport(depsWith(post))).toEqual({ kind: "stale_device" });
  });
});
