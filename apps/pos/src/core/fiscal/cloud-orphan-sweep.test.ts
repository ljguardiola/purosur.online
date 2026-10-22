import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudOrphanSweep } from "./cloud-orphan-sweep";

function sweepAnswering(response: CloudResponse) {
  const calls: { path: string; bearerToken: string; body: unknown }[] = [];
  const sweep = new CloudOrphanSweep({
    deviceToken: "prefix.secret",
    post: async (path, bearerToken, body) => {
      calls.push({ path, bearerToken, body });
      return response;
    },
  });
  return { sweep, calls };
}

describe("asking the cloud to sweep the register's orphan authorizations", () => {
  it("asks with the device token and reads a sweep as done", async () => {
    const { sweep, calls } = sweepAnswering({
      kind: "ok",
      body: { state: "SWEPT", credit_noted_numbers: [41], alerted_numbers: [] },
    });

    expect(await sweep.requestSweep()).toEqual({ kind: "swept" });
    expect(calls).toEqual([
      { path: "/api/devices/current/orphan-sweep", bearerToken: "prefix.secret", body: {} },
    ]);
  });

  it("reads the cloud's answer that the numbering is not reconciled yet", async () => {
    const { sweep } = sweepAnswering({
      kind: "ok",
      body: { state: "NUMBERING_NOT_RECONCILED" },
    });

    expect(await sweep.requestSweep()).toEqual({ kind: "numbering_not_reconciled" });
  });

  it("reports an unreachable cloud", async () => {
    const { sweep } = sweepAnswering({ kind: "unreachable" });

    expect(await sweep.requestSweep()).toEqual({
      kind: "failed",
      failure: { kind: "unreachable" },
    });
  });

  it("reports the cloud's refusal with its code", async () => {
    const { sweep } = sweepAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await sweep.requestSweep()).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("reports an answer it cannot read", async () => {
    const { sweep } = sweepAnswering({ kind: "ok", body: { state: "SOMETHING_ELSE" } });

    expect(await sweep.requestSweep()).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });
});
