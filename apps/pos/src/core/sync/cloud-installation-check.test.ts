import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudInstallationCheck } from "./cloud-installation-check";

function checkAnswering(response: CloudResponse) {
  const requests: { path: string; headers: Record<string, string> }[] = [];
  const check = new CloudInstallationCheck(async (path, headers) => {
    requests.push({ path, headers });
    return response;
  }, "prefix.secret");
  return { check, requests };
}

const healthy = (installation?: { revoked: boolean }): CloudResponse => ({
  kind: "ok",
  body: { status: "ok", version: "1.0.0", ...(installation && { installation }) },
});

describe("asking the cloud's health check about this installation", () => {
  it("asks with the device token", async () => {
    const { check, requests } = checkAnswering(healthy({ revoked: false }));

    await check.standing();

    expect(requests).toEqual([
      { path: "/api/health", headers: { authorization: "Bearer prefix.secret" } },
    ]);
  });

  it("answers revoked when the cloud says the installation was revoked", async () => {
    const { check } = checkAnswering(healthy({ revoked: true }));

    expect(await check.standing()).toEqual({ kind: "revoked" });
  });

  it("answers in service when the cloud says the installation was not revoked", async () => {
    const { check } = checkAnswering(healthy({ revoked: false }));

    expect(await check.standing()).toEqual({ kind: "in_service" });
  });

  it("fails without a standing when the cloud refuses the device token", async () => {
    const { check } = checkAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await check.standing()).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("fails without a standing when the answer says nothing about the installation", async () => {
    const { check } = checkAnswering(healthy());

    expect(await check.standing()).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
  });

  it("fails without a standing when the answer can't be read", async () => {
    const { check } = checkAnswering({ kind: "ok", body: { installation: { revoked: true } } });

    expect(await check.standing()).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
  });

  it("fails without a standing when the cloud can't be reached", async () => {
    const { check } = checkAnswering({ kind: "unreachable" });

    expect(await check.standing()).toEqual({ kind: "failed", failure: { kind: "unreachable" } });
  });
});
