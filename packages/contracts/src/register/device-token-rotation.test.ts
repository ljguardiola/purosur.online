import { describe, expect, it } from "vitest";
import { deviceTokenRotationSchema } from "./device-token-rotation.js";

const KEY = Buffer.alloc(32, 1).toString("base64");
const ROTATION = {
  device_token: "prefix.secret",
  snapshot_key_versions: [{ version: 1, key: KEY }],
  contingency_ticket_key: { version: 1, key: KEY },
  outbox_chain_key: KEY,
};

describe("deviceTokenRotationSchema", () => {
  it("accepts the answer carrying the new device token and the installation's keys", () => {
    expect(deviceTokenRotationSchema.parse(ROTATION)).toEqual(ROTATION);
  });

  it.each(["device_token", "snapshot_key_versions", "contingency_ticket_key", "outbox_chain_key"])(
    "rejects an answer without %s",
    (field) => {
      const body: Record<string, unknown> = { ...ROTATION };
      delete body[field];

      expect(deviceTokenRotationSchema.safeParse(body).success).toBe(false);
    },
  );

  it("rejects a device token that is not text", () => {
    expect(deviceTokenRotationSchema.safeParse({ ...ROTATION, device_token: 7 }).success).toBe(
      false,
    );
  });
});
