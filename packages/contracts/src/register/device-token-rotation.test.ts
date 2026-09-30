import { describe, expect, it } from "vitest";
import { deviceTokenRotationSchema } from "./device-token-rotation.js";

describe("deviceTokenRotationSchema", () => {
  it("accepts the answer carrying the new device token", () => {
    const body = { device_token: "prefix.secret" };

    expect(deviceTokenRotationSchema.parse(body)).toEqual(body);
  });

  it("rejects an answer without a device token", () => {
    expect(deviceTokenRotationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a device token that is not text", () => {
    expect(deviceTokenRotationSchema.safeParse({ device_token: 7 }).success).toBe(false);
  });
});
