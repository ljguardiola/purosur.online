import { describe, expect, it } from "vitest";
import {
  readDeviceCredentialsAnswer,
  readDeviceCredentialsRequest,
} from "./device-credentials-messages";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };

describe("readDeviceCredentialsRequest", () => {
  it("reads credentials the core hands main to store", () => {
    const message = {
      type: "store-device-credentials",
      request_id: "r1",
      credentials: CREDENTIALS,
    };

    expect(readDeviceCredentialsRequest(message)).toEqual(message);
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

  it.each([true, false])("reads whether credentials are present: %s", (present) => {
    const message = { type: "device-credentials-presence", request_id: "r2", present };

    expect(readDeviceCredentialsAnswer(message)).toEqual(message);
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
    ["a health check", { type: "health-check" }],
    ["undefined", undefined],
  ])("reads nothing from %s", (_case, message) => {
    expect(readDeviceCredentialsAnswer(message)).toBeUndefined();
  });
});
