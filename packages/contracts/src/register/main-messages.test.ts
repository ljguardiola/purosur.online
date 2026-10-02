import { describe, expect, it } from "vitest";
import { coreStatusMessageSchema, mainToCoreMessageSchema } from "./main-messages.js";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const CREDENTIALS = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  token_received_at: "2026-09-29T12:00:00.000Z",
  keys: {
    snapshot_key_versions: [
      { version: 1, key: KEY_A },
      { version: 2, key: KEY_B },
    ],
    contingency_ticket_key: { version: 1, key: KEY_B },
    outbox_chain_key: KEY_A,
  },
};

function readAnswerWith(credentials: unknown) {
  return { type: "device-credentials-read", request_id: "r4", credentials };
}

describe("mainToCoreMessageSchema", () => {
  it("accepts a health check", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(true);
  });

  it.each([true, false])("accepts whether main stored the credentials: %s", (stored) => {
    const message = { type: "device-credentials-stored", request_id: "r1", stored };

    expect(mainToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([true, false])("accepts whether credentials can be stored: %s", (storable) => {
    const message = { type: "device-credentials-storable", request_id: "r3", storable };

    expect(mainToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([true, false])("accepts whether credentials are present: %s", (present) => {
    const message = { type: "device-credentials-presence", request_id: "r2", present };

    expect(mainToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["replaced", "superseded", "not_stored"])(
    "accepts how main answered a replace request: %s",
    (outcome) => {
      const message = { type: "device-credentials-replaced", request_id: "r5", outcome };

      expect(mainToCoreMessageSchema.parse(message)).toEqual(message);
    },
  );

  it("accepts the credentials main holds", () => {
    expect(mainToCoreMessageSchema.parse(readAnswerWith(CREDENTIALS))).toEqual(
      readAnswerWith(CREDENTIALS),
    );
  });

  it("accepts that main holds no credentials", () => {
    const message = { type: "device-credentials-read", request_id: "r4" };

    expect(mainToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts credentials stored before their token's arrival was recorded", () => {
    const { token_received_at: _unrecorded, ...older } = CREDENTIALS;

    expect(mainToCoreMessageSchema.parse(readAnswerWith(older))).toEqual(readAnswerWith(older));
  });

  it("accepts credentials stored before the installation was handed its keys", () => {
    const { keys: _none, ...older } = CREDENTIALS;

    expect(mainToCoreMessageSchema.parse(readAnswerWith(older))).toEqual(readAnswerWith(older));
  });

  it("keeps only the credential fields it knows", () => {
    const parsed = mainToCoreMessageSchema.parse(readAnswerWith({ ...CREDENTIALS, extra: "x" }));

    expect(parsed).toEqual(readAnswerWith(CREDENTIALS));
  });

  it.each([
    ["without a device token", { device_id: "a4b1", pepper: "cGVwcGVy" }],
    ["whose token arrival isn't a string", { ...CREDENTIALS, token_received_at: 1 }],
    [
      "whose outbox-chain key isn't a well-formed installation key",
      { ...CREDENTIALS, keys: { ...CREDENTIALS.keys, outbox_chain_key: "b3V0Ym94" } },
    ],
    [
      "with two snapshot keys under the same version",
      {
        ...CREDENTIALS,
        keys: {
          ...CREDENTIALS.keys,
          snapshot_key_versions: [
            { version: 1, key: KEY_A },
            { version: 1, key: KEY_B },
          ],
        },
      },
    ],
  ])("rejects a read answer with credentials %s", (_case, credentials) => {
    expect(mainToCoreMessageSchema.safeParse(readAnswerWith(credentials)).success).toBe(false);
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
    [
      "a replace answer with an outcome it doesn't know",
      { type: "device-credentials-replaced", request_id: "r", outcome: "maybe" },
    ],
    ["a request main would answer", { type: "device-credentials-request", request_id: "r" }],
    ["any other message type", { type: "ping" }],
    ["an empty message", {}],
    ["undefined", undefined],
  ])("rejects %s", (_case, message) => {
    expect(mainToCoreMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("coreStatusMessageSchema", () => {
  it.each(["starting", "down", "up"])("accepts a core status of %s", (status) => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status }).success).toBe(true);
  });

  it("rejects a status outside starting, down and up", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status: "" }).success).toBe(
      false,
    );
    expect(coreStatusMessageSchema.safeParse({ type: "core-status" }).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "ping", status: "up" }).success).toBe(false);
    expect(coreStatusMessageSchema.safeParse({ status: "up" }).success).toBe(false);
  });
});
