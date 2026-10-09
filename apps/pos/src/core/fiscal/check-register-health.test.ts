import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";
import type { RegisterHealthCheck } from "@purosur/domain/fiscal/use-cases";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { checkRegisterHealth } from "./check-register-health";

const START = new Date("2026-09-30T12:00:00.000Z");
const ROUND_TRIP_MS = 180;

interface Get {
  path: string;
  headers: Record<string, string>;
  options: CloudCallOptions;
}

function health(
  answer: CloudResponse,
  token: string | null = "prefix.secret",
  roundTripMs = ROUND_TRIP_MS,
) {
  const gets: Get[] = [];
  const recorded: RegisterHealthCheck[] = [];
  const moments = [START, new Date(START.getTime() + roundTripMs)];
  const outcome = checkRegisterHealth({
    readDeviceToken: async () => token ?? undefined,
    get: async (path, headers, options) => {
      gets.push({ path, headers, options });
      return answer;
    },
    record: async (check) => {
      recorded.push(check);
    },
    now: () => moments.shift() ?? START,
  });
  return { gets, recorded, outcome };
}

function ok(arca: unknown): CloudResponse {
  return {
    kind: "ok",
    body: { status: "ok", version: "abc1234", installation: { revoked: false }, arca },
  };
}

const ARCA = { token_valid: true, probe_ok_at: "2026-09-30T11:59:58.000Z", reachable: true };

describe("checking the register's health against the cloud", () => {
  it("asks the cloud's health with the device token, once, within the check interval", async () => {
    const { gets, outcome } = health(ok(ARCA));
    await outcome;

    expect(gets).toEqual([
      {
        path: "/api/health",
        headers: { authorization: "Bearer prefix.secret" },
        options: { timeoutMs: REGISTER_HEALTH_CHECK_INTERVAL_MS, singleAttempt: true },
      },
    ]);
  });

  it("records the round trip, when the answer arrived and what the cloud found out about the tax authority", async () => {
    const { recorded, outcome } = health(ok(ARCA));

    await expect(outcome).resolves.toBe("recorded");
    expect(recorded).toEqual([
      {
        checkedAt: new Date(START.getTime() + ROUND_TRIP_MS),
        roundTripMs: ROUND_TRIP_MS,
        tokenValid: true,
        arcaReachable: true,
      },
    ]);
  });

  it.each([
    ["an invalid token", { token_valid: false, probe_ok_at: null, reachable: true }],
    ["an unreachable tax authority", { token_valid: true, probe_ok_at: null, reachable: false }],
  ])("records the check that found %s", async (_case, arca) => {
    const { recorded, outcome } = health(ok(arca));

    await expect(outcome).resolves.toBe("recorded");
    expect(recorded).toMatchObject([
      { tokenValid: arca.token_valid, arcaReachable: arca.reachable },
    ]);
  });

  it.each([
    ["the cloud is unreachable", { kind: "unreachable" } satisfies CloudResponse],
    [
      "the cloud refuses",
      {
        kind: "error",
        error: { code: "server_unavailable", message: "x", details: [] },
      } satisfies CloudResponse,
    ],
    ["the answer carries no state of the tax authority", ok(undefined)],
    [
      "the answer is not the contract's",
      { kind: "ok", body: { status: "degraded" } } satisfies CloudResponse,
    ],
    ["the answer has no body", { kind: "ok", body: undefined } satisfies CloudResponse],
  ])("records nothing when %s", async (_case, answer) => {
    const { recorded, outcome } = health(answer);

    await expect(outcome).resolves.toBe("skipped");
    expect(recorded).toEqual([]);
  });

  it("asks and records nothing before the register is enrolled", async () => {
    const { gets, recorded, outcome } = health(ok(ARCA), null);

    await expect(outcome).resolves.toBe("skipped");
    expect(gets).toEqual([]);
    expect(recorded).toEqual([]);
  });
});
