import { describe, expect, it } from "vitest";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { type DeviceTokenRotationDeps, rotateDeviceToken } from "./device-token-rotation";

const RECEIVED_AT = new Date("2026-09-28T12:00:00.000Z");
const DUE_AT = new Date("2026-09-29T12:00:00.000Z");
const BEFORE_DUE = new Date("2026-09-29T11:59:59.999Z");

const CREDENTIALS: DeviceCredentials = {
  device_id: "a4b1",
  device_token: "old-prefix.old-secret",
  pepper: "cGVwcGVy",
  token_received_at: RECEIVED_AT.toISOString(),
};

function rotationWith(options: {
  credentials?: DeviceCredentials | undefined;
  now?: Date;
  response?: CloudResponse;
  stored?: boolean;
}) {
  const posted: { path: string; bearerToken: string }[] = [];
  const storedCredentials: DeviceCredentials[] = [];
  const deps: DeviceTokenRotationDeps = {
    readCredentials: async () => ("credentials" in options ? options.credentials : CREDENTIALS),
    postToCloud: async (path, bearerToken) => {
      posted.push({ path, bearerToken });
      return options.response ?? { kind: "ok", body: { device_token: "new-prefix.new-secret" } };
    },
    storeCredentials: async (credentials) => {
      storedCredentials.push(credentials);
      return options.stored ?? true;
    },
    now: () => options.now ?? DUE_AT,
  };
  return { deps, posted, storedCredentials };
}

function refusal(code: string): CloudResponse {
  return { kind: "error", error: { code, message: "x", details: [] } } as CloudResponse;
}

describe("rotateDeviceToken", () => {
  it("asks the cloud for a new token, presenting the current one, once the current one is a day old", async () => {
    const { deps, posted } = rotationWith({ now: DUE_AT });

    await rotateDeviceToken(deps);

    expect(posted).toEqual([
      { path: "/devices/rotate-token", bearerToken: "old-prefix.old-secret" },
    ]);
  });

  it("keeps the same device and pepper, swaps in the new token and records when it arrived", async () => {
    const { deps, storedCredentials } = rotationWith({ now: DUE_AT });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "rotated" });
    expect(storedCredentials).toEqual([
      {
        device_id: "a4b1",
        pepper: "cGVwcGVy",
        device_token: "new-prefix.new-secret",
        token_received_at: "2026-09-29T12:00:00.000Z",
      },
    ]);
  });

  it("leaves the token alone before it is a day old", async () => {
    const { deps, posted, storedCredentials } = rotationWith({ now: BEFORE_DUE });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "not_due" });
    expect(posted).toEqual([]);
    expect(storedCredentials).toEqual([]);
  });

  it.each([
    ["never recorded", (({ token_received_at: _unrecorded, ...older }) => older)(CREDENTIALS)],
    ["not a date", { ...CREDENTIALS, token_received_at: "yesterday-ish" }],
  ])("rotates at once a token whose arrival was %s", async (_case, credentials) => {
    const { deps, posted } = rotationWith({ credentials, now: BEFORE_DUE });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "rotated" });
    expect(posted).toHaveLength(1);
  });

  it("does nothing when the register isn't enrolled", async () => {
    const { deps, posted } = rotationWith({ credentials: undefined });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "not_enrolled" });
    expect(posted).toEqual([]);
  });

  it("keeps the old token when the cloud rejects it", async () => {
    const { deps, storedCredentials } = rotationWith({
      response: refusal("device_token_rejected"),
    });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "rejected" });
    expect(storedCredentials).toEqual([]);
  });

  it("keeps the old token when the cloud can't be reached", async () => {
    const { deps, storedCredentials } = rotationWith({ response: { kind: "unreachable" } });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "unreachable" });
    expect(storedCredentials).toEqual([]);
  });

  it.each([
    ["refuses for another reason", refusal("server_unavailable")],
    [
      "answers something that isn't a new token",
      { kind: "ok", body: { ok: true } } as CloudResponse,
    ],
  ])("keeps the old token when the cloud %s", async (_case, response) => {
    const { deps, storedCredentials } = rotationWith({ response });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "unavailable" });
    expect(storedCredentials).toEqual([]);
  });

  it("says the new token wasn't kept when it can't be stored", async () => {
    const { deps } = rotationWith({ stored: false });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "not_stored" });
  });
});
