import { describe, expect, it } from "vitest";
import {
  quietRegisterObservation,
  registerSyncedObservation,
  registerVersionObservation,
} from "./alert-condition-observation.js";

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

describe("quietRegisterObservation", () => {
  it("holds the silent-register condition of the register, in its branch, naming the device and when it last had a push accepted", () => {
    expect(
      quietRegisterObservation({
        registerId: "register-1",
        deviceId: "device-1",
        locationId: "location-1",
        lastAcceptedPushAt: new Date("2026-10-05T14:30:00.000Z"),
      }),
    ).toEqual({
      holds: true,
      alert: {
        kind: "register_silent",
        scope: "register-1",
        locationId: "location-1",
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-10-05T14:30:00.000Z" },
      },
    });
  });

  it("names no last accepted push for a register that never had one", () => {
    expect(
      quietRegisterObservation({
        registerId: "register-1",
        deviceId: "device-1",
        locationId: "location-1",
        lastAcceptedPushAt: null,
      }),
    ).toMatchObject({ alert: { detail: { deviceId: "device-1", lastAcceptedPushAt: null } } });
  });
});

describe("registerSyncedObservation", () => {
  it("clears the silent-register condition of the register", () => {
    expect(registerSyncedObservation("register-1")).toEqual({
      holds: false,
      kind: "register_silent",
      scope: "register-1",
    });
  });
});
