import { describe, expect, it } from "vitest";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { type DeviceTokenRotationDeps, rotateDeviceToken } from "./device-token-rotation";

const RECEIVED_AT = new Date("2026-09-28T12:00:00.000Z");
const DUE_AT = new Date("2026-09-29T12:00:00.000Z");
const BEFORE_DUE = new Date("2026-09-29T11:59:59.999Z");

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64");
const HELD_KEYS = {
  snapshot_key_versions: [{ version: 1, key: key(1) }],
  contingency_ticket_key: { version: 1, key: key(2) },
  outbox_chain_key: key(3),
};
const CURRENT_KEYS = {
  snapshot_key_versions: [
    { version: 1, key: key(1) },
    { version: 2, key: key(4) },
  ],
  contingency_ticket_key: { version: 2, key: key(5) },
  outbox_chain_key: key(3),
};
const ROTATED_BODY = { device_token: "new-prefix.new-secret", ...CURRENT_KEYS };

const CREDENTIALS: DeviceCredentials = {
  device_id: "a4b1",
  device_token: "old-prefix.old-secret",
  pepper: "cGVwcGVy",
  token_received_at: RECEIVED_AT.toISOString(),
  keys: HELD_KEYS,
};

function rotationWith(options: {
  credentials?: DeviceCredentials | undefined;
  now?: Date;
  response?: CloudResponse;
  replacement?: "replaced" | "superseded" | "not_stored";
}) {
  const posted: { path: string; bearerToken: string }[] = [];
  const storedCredentials: DeviceCredentials[] = [];
  const replacedTokens: string[] = [];
  const deps: DeviceTokenRotationDeps = {
    readCredentials: async () => ("credentials" in options ? options.credentials : CREDENTIALS),
    postToCloud: async (path, bearerToken) => {
      posted.push({ path, bearerToken });
      return options.response ?? { kind: "ok", body: ROTATED_BODY };
    },
    replaceCredentials: async (expectedDeviceToken, credentials) => {
      replacedTokens.push(expectedDeviceToken);
      const outcome = options.replacement ?? "replaced";
      if (outcome === "replaced") {
        storedCredentials.push(credentials);
      }
      return outcome;
    },
    now: () => options.now ?? DUE_AT,
  };
  return { deps, posted, storedCredentials, replacedTokens };
}

function refusal(code: string): CloudResponse {
  return { kind: "error", error: { code, message: "x", details: [] } } as CloudResponse;
}

describe("rotateDeviceToken", () => {
  it("asks the cloud for a new token, presenting the current one, once the current one is a day old", async () => {
    const { deps, posted } = rotationWith({ now: DUE_AT });

    await rotateDeviceToken(deps);

    expect(posted).toEqual([
      { path: "/api/devices/rotate-token", bearerToken: "old-prefix.old-secret" },
    ]);
  });

  it("keeps the same device and pepper, swaps in the new token and the keys handed back with it, and records when it arrived", async () => {
    const { deps, storedCredentials } = rotationWith({ now: DUE_AT });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "rotated" });
    expect(storedCredentials).toEqual([
      {
        device_id: "a4b1",
        pepper: "cGVwcGVy",
        device_token: "new-prefix.new-secret",
        token_received_at: "2026-09-29T12:00:00.000Z",
        keys: CURRENT_KEYS,
      },
    ]);
  });

  it("rotates at once, before the token is a day old, when the register holds no keys yet", async () => {
    const { keys: _notHandedOver, ...withoutKeys } = CREDENTIALS;
    const { deps, storedCredentials } = rotationWith({
      credentials: withoutKeys,
      now: BEFORE_DUE,
    });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "rotated" });
    expect(storedCredentials[0]?.keys).toEqual(CURRENT_KEYS);
  });

  it("reads a rotation answered without the keys as the cloud being unavailable, keeping the old token", async () => {
    const { deps, storedCredentials } = rotationWith({
      response: { kind: "ok", body: { device_token: "new-prefix.new-secret" } },
    });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "unavailable" });
    expect(storedCredentials).toEqual([]);
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
    const { deps } = rotationWith({ replacement: "not_stored" });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "not_stored" });
  });

  it("replaces only the credentials still holding the token it rotated", async () => {
    const { deps, replacedTokens } = rotationWith({});

    await rotateDeviceToken(deps);

    expect(replacedTokens).toEqual(["old-prefix.old-secret"]);
  });

  it("says it was superseded, writing nothing, when the register enrolled again meanwhile", async () => {
    const { deps, storedCredentials } = rotationWith({ replacement: "superseded" });

    expect(await rotateDeviceToken(deps)).toEqual({ kind: "superseded" });
    expect(storedCredentials).toEqual([]);
  });
});
