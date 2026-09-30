import { describe, expect, it } from "vitest";
import {
  readDeviceCredentialsAnswer,
  readDeviceCredentialsRequest,
} from "./device-credentials-messages";

const CREDENTIALS = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  token_received_at: "2026-09-29T12:00:00.000Z",
  keys: {
    snapshot_key_versions: [
      { version: 1, key: "c25hcHNob3QtMQ==" },
      { version: 2, key: "c25hcHNob3QtMg==" },
    ],
    contingency_ticket_key: { version: 1, key: "dGlja2V0" },
    outbox_chain_key: "b3V0Ym94",
  },
};

describe("readDeviceCredentialsRequest", () => {
  it("reads credentials the core hands main to store", () => {
    const message = {
      type: "store-device-credentials",
      request_id: "r1",
      credentials: CREDENTIALS,
    };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it("reads the core's question of whether credentials can be stored at all", () => {
    const message = { type: "device-credentials-storable-request", request_id: "r3" };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it("reads credentials the core asks main to swap in for the ones holding a given token", () => {
    const message = {
      type: "replace-device-credentials",
      request_id: "r5",
      expected_device_token: "old.token",
      credentials: CREDENTIALS,
    };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it.each([
    ["without the token it expects", { credentials: CREDENTIALS }],
    [
      "with an expected token that isn't a string",
      { expected_device_token: 7, credentials: CREDENTIALS },
    ],
    ["without credentials", { expected_device_token: "old.token" }],
  ])("reads nothing from a replace request %s", (_case, fields) => {
    expect(
      readDeviceCredentialsRequest({
        type: "replace-device-credentials",
        request_id: "r5",
        ...fields,
      }),
    ).toBeUndefined();
  });

  it("reads the core's question for the stored credentials", () => {
    const message = { type: "device-credentials-read-request", request_id: "r4" };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it("reads credentials stored before their token's arrival was recorded", () => {
    const { token_received_at: _unrecorded, ...older } = CREDENTIALS;
    const message = { type: "store-device-credentials", request_id: "r1", credentials: older };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it("reads credentials stored before the installation was handed its keys", () => {
    const { keys: _notHandedOver, ...older } = CREDENTIALS;
    const message = { type: "store-device-credentials", request_id: "r1", credentials: older };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it.each([
    ["keys that aren't an object", "keys"],
    ["no snapshot key versions", { ...CREDENTIALS.keys, snapshot_key_versions: undefined }],
    [
      "snapshot key versions that aren't a list",
      { ...CREDENTIALS.keys, snapshot_key_versions: {} },
    ],
    [
      "a snapshot key version that isn't a number",
      { ...CREDENTIALS.keys, snapshot_key_versions: [{ version: "1", key: "a2V5" }] },
    ],
    [
      "a snapshot key that isn't a string",
      { ...CREDENTIALS.keys, snapshot_key_versions: [{ version: 1, key: 7 }] },
    ],
    [
      "a snapshot key version that isn't an object",
      { ...CREDENTIALS.keys, snapshot_key_versions: [null] },
    ],
    ["no contingency-ticket key", { ...CREDENTIALS.keys, contingency_ticket_key: undefined }],
    [
      "a contingency-ticket key without its version",
      { ...CREDENTIALS.keys, contingency_ticket_key: { key: "a2V5" } },
    ],
    [
      "a contingency-ticket key that isn't a string",
      { ...CREDENTIALS.keys, contingency_ticket_key: { version: 1, key: null } },
    ],
    ["an outbox-chain key that isn't a string", { ...CREDENTIALS.keys, outbox_chain_key: 7 }],
  ])("reads nothing from credentials with %s", (_case, keys) => {
    expect(
      readDeviceCredentialsRequest({
        type: "store-device-credentials",
        request_id: "r1",
        credentials: { ...CREDENTIALS, keys },
      }),
    ).toBeUndefined();
  });

  it("keeps only the key fields it knows", () => {
    const message = {
      type: "store-device-credentials",
      request_id: "r1",
      credentials: {
        ...CREDENTIALS,
        keys: {
          ...CREDENTIALS.keys,
          contingency_ticket_key: { ...CREDENTIALS.keys.contingency_ticket_key, extra: "x" },
          snapshot_key_versions: [{ version: 1, key: "c25hcHNob3QtMQ==", extra: "y" }],
          extra: "z",
        },
      },
    };

    expect(readDeviceCredentialsRequest(message)).toEqual({
      type: "store-device-credentials",
      request_id: "r1",
      credentials: {
        ...CREDENTIALS,
        keys: {
          ...CREDENTIALS.keys,
          snapshot_key_versions: [{ version: 1, key: "c25hcHNob3QtMQ==" }],
        },
      },
    });
  });

  it("reads nothing from credentials whose token arrival isn't a string", () => {
    expect(
      readDeviceCredentialsRequest({
        type: "store-device-credentials",
        request_id: "r1",
        credentials: { ...CREDENTIALS, token_received_at: 7 },
      }),
    ).toBeUndefined();
  });

  it("reads the core's question of whether credentials are stored", () => {
    const message = { type: "device-credentials-request", request_id: "r2" };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
  });

  it.each(["device_id", "device_token", "pepper"])(
    "reads nothing from credentials without a %s",
    (field) => {
      const credentials: Record<string, unknown> = { ...CREDENTIALS, [field]: 7 };

      expect(
        readDeviceCredentialsRequest({
          type: "store-device-credentials",
          request_id: "r1",
          credentials,
        }),
      ).toBeUndefined();
    },
  );

  it.each([
    ["a message that isn't an object", "store-device-credentials"],
    ["null", null],
    ["a request without its id", { type: "device-credentials-request" }],
    ["a store request without credentials", { type: "store-device-credentials", request_id: "r" }],
    ["another message", { type: "core-ready" }],
  ])("reads nothing from %s", (_case, message) => {
    expect(readDeviceCredentialsRequest(message)).toBeUndefined();
  });

  it("keeps only the fields it knows", () => {
    const message = {
      type: "store-device-credentials",
      request_id: "r1",
      credentials: { ...CREDENTIALS, extra: "x" },
      extra: "y",
    };

    expect(readDeviceCredentialsRequest(message)).toEqual({
      type: "store-device-credentials",
      request_id: "r1",
      credentials: CREDENTIALS,
    });
  });
});

describe("readDeviceCredentialsAnswer", () => {
  it.each([true, false])("reads whether main stored the credentials: %s", (stored) => {
    const message = { type: "device-credentials-stored", request_id: "r1", stored };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it.each([true, false])("reads whether credentials can be stored: %s", (storable) => {
    const message = { type: "device-credentials-storable", request_id: "r3", storable };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it.each([true, false])("reads whether credentials are present: %s", (present) => {
    const message = { type: "device-credentials-presence", request_id: "r2", present };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it.each(["replaced", "superseded", "not_stored"])(
    "reads how main answered a replace request: %s",
    (outcome) => {
      const message = { type: "device-credentials-replaced", request_id: "r5", outcome };

      expect(readDeviceCredentialsAnswer(message)).toEqual(message);
    },
  );

  it("reads nothing from a replace answer with an outcome it doesn't know", () => {
    expect(
      readDeviceCredentialsAnswer({
        type: "device-credentials-replaced",
        request_id: "r5",
        outcome: "maybe",
      }),
    ).toBeUndefined();
  });

  it("reads the credentials main holds", () => {
    const message = {
      type: "device-credentials-read",
      request_id: "r4",
      credentials: CREDENTIALS,
    };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it("reads that main holds no credentials", () => {
    const message = { type: "device-credentials-read", request_id: "r4" };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it("reads credentials main holds that predate the recorded token arrival", () => {
    const { token_received_at: _unrecorded, ...older } = CREDENTIALS;
    const message = { type: "device-credentials-read", request_id: "r4", credentials: older };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
  });

  it("reads a read answer whose credentials are malformed as no credentials", () => {
    expect(
      readDeviceCredentialsAnswer({
        type: "device-credentials-read",
        request_id: "r4",
        credentials: { device_id: "a4b1" },
      }),
    ).toEqual({ type: "device-credentials-read", request_id: "r4" });
  });

  it.each([
    ["an answer without its id", { type: "device-credentials-stored", stored: true }],
    [
      "a stored answer that isn't a boolean",
      { type: "device-credentials-stored", request_id: "r", stored: "yes" },
    ],
    [
      "a presence answer without presence",
      { type: "device-credentials-presence", request_id: "r" },
    ],
    [
      "a storable answer without whether it can store",
      { type: "device-credentials-storable", request_id: "r" },
    ],
    ["a health check", { type: "health-check" }],
    ["undefined", undefined],
  ])("reads nothing from %s", (_case, message) => {
    expect(readDeviceCredentialsAnswer(message)).toBeUndefined();
  });
});
