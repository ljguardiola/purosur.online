import { describe, expect, it } from "vitest";
import { registerVersionObservation } from "./alert-condition-observation.js";

describe("registerVersionObservation", () => {
  it("holds the update-required condition of the register, naming the device and the version, for a version the cloud does not accept", () => {
    expect(
      registerVersionObservation({
        registerId: "register-1",
        deviceId: "device-1",
        appVersion: "0.9.0",
        accepted: false,
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "update_required",
        scope: "register-1",
        detail: { deviceId: "device-1", appVersion: "0.9.0" },
      },
    });
  });

  it("clears the update-required condition of the register for a version the cloud accepts", () => {
    expect(
      registerVersionObservation({
        registerId: "register-1",
        deviceId: "device-1",
        appVersion: "1.4.0",
        accepted: true,
      }),
    ).toEqual({ holds: false, kind: "update_required", scope: "register-1" });
  });
});
