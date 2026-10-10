import { describe, expect, it } from "vitest";
import {
  type DetectedSerialDevice,
  isSameSerialDeviceIdentity,
  isSerialDeviceMissing,
  SERIAL_DEVICE_ROLES,
  type SerialDeviceIdentity,
  type SerialDeviceStanding,
  serialDeviceStandings,
} from "./serial-devices.js";

const SCALE: SerialDeviceIdentity = { vendorId: "0403", productId: "6001" };
const READER: SerialDeviceIdentity = { vendorId: "05e0", productId: "1200" };
const STRANGER: SerialDeviceIdentity = { vendorId: "1a86", productId: "7523" };

function detected(path: string, identity: SerialDeviceIdentity): DetectedSerialDevice {
  return { path, identity };
}

describe("SERIAL_DEVICE_ROLES", () => {
  it("names the scale and the reader", () => {
    expect(SERIAL_DEVICE_ROLES).toEqual(["scale", "reader"]);
  });
});

describe("isSameSerialDeviceIdentity", () => {
  it("is true for the same vendor and product", () => {
    expect(isSameSerialDeviceIdentity(SCALE, { ...SCALE })).toBe(true);
  });

  it("is false when only the vendor differs", () => {
    expect(isSameSerialDeviceIdentity(SCALE, { ...SCALE, vendorId: "0404" })).toBe(false);
  });

  it("is false when only the product differs", () => {
    expect(isSameSerialDeviceIdentity(SCALE, { ...SCALE, productId: "6002" })).toBe(false);
  });
});

describe("serialDeviceStandings", () => {
  it("matches each registered device with the path where it is now", () => {
    expect(
      serialDeviceStandings({ scale: SCALE, reader: READER }, [
        detected("COM4", READER),
        detected("COM3", SCALE),
      ]),
    ).toEqual({
      scale: { kind: "matching", path: "COM3" },
      reader: { kind: "matching", path: "COM4" },
    });
  });

  it("still matches a device the system moved to another path", () => {
    expect(serialDeviceStandings({ scale: SCALE }, [detected("COM9", SCALE)]).scale).toEqual({
      kind: "matching",
      path: "COM9",
    });
  });

  it("matches the first path in order when several detected devices share the identity", () => {
    expect(
      serialDeviceStandings({ scale: SCALE }, [
        detected("COM7", SCALE),
        detected("COM2", SCALE),
        detected("COM5", SCALE),
      ]).scale,
    ).toEqual({ kind: "matching", path: "COM2" });
  });

  it("reports a role with nothing registered as not registered, whatever is connected", () => {
    expect(serialDeviceStandings({}, [detected("COM3", SCALE)])).toEqual({
      scale: { kind: "not_registered" },
      reader: { kind: "not_registered" },
    });
  });

  it("reports a registered device that is not connected as not detected", () => {
    expect(serialDeviceStandings({ scale: SCALE, reader: READER }, [])).toEqual({
      scale: { kind: "not_detected" },
      reader: { kind: "not_detected" },
    });
  });

  it("reports a missing device as not detected while only registered devices are connected", () => {
    expect(
      serialDeviceStandings({ scale: SCALE, reader: READER }, [detected("COM3", SCALE)]),
    ).toEqual({
      scale: { kind: "matching", path: "COM3" },
      reader: { kind: "not_detected" },
    });
  });

  it("reports a missing device as mismatched when a device neither role registered is connected", () => {
    expect(
      serialDeviceStandings({ scale: SCALE, reader: READER }, [
        detected("COM3", SCALE),
        detected("COM4", STRANGER),
      ]),
    ).toEqual({
      scale: { kind: "matching", path: "COM3" },
      reader: { kind: "mismatched" },
    });
  });

  it("reports both roles as mismatched when only an unknown device is connected", () => {
    expect(
      serialDeviceStandings({ scale: SCALE, reader: READER }, [detected("COM4", STRANGER)]),
    ).toEqual({
      scale: { kind: "mismatched" },
      reader: { kind: "mismatched" },
    });
  });

  it("keeps a role with nothing registered out of the mismatch", () => {
    expect(serialDeviceStandings({ scale: SCALE }, [detected("COM4", STRANGER)])).toEqual({
      scale: { kind: "mismatched" },
      reader: { kind: "not_registered" },
    });
  });

  it("does not call the other role's device unknown", () => {
    expect(
      serialDeviceStandings({ scale: SCALE, reader: READER }, [detected("COM4", READER)]),
    ).toEqual({
      scale: { kind: "not_detected" },
      reader: { kind: "matching", path: "COM4" },
    });
  });
});

describe("isSerialDeviceMissing", () => {
  function standings(
    scale: SerialDeviceStanding,
    reader: SerialDeviceStanding,
  ): Record<"scale" | "reader", SerialDeviceStanding> {
    return { scale, reader };
  }
  const MATCHING: SerialDeviceStanding = { kind: "matching", path: "COM3" };

  it("is false when every role matches or is not registered", () => {
    expect(isSerialDeviceMissing(standings(MATCHING, { kind: "not_registered" }))).toBe(false);
    expect(isSerialDeviceMissing(standings({ kind: "not_registered" }, MATCHING))).toBe(false);
    expect(
      isSerialDeviceMissing(standings({ kind: "not_registered" }, { kind: "not_registered" })),
    ).toBe(false);
    expect(isSerialDeviceMissing(standings(MATCHING, MATCHING))).toBe(false);
  });

  it("is true when the scale is not detected", () => {
    expect(isSerialDeviceMissing(standings({ kind: "not_detected" }, MATCHING))).toBe(true);
  });

  it("is true when the reader is not detected", () => {
    expect(isSerialDeviceMissing(standings(MATCHING, { kind: "not_detected" }))).toBe(true);
  });

  it("is true when the scale is mismatched", () => {
    expect(isSerialDeviceMissing(standings({ kind: "mismatched" }, MATCHING))).toBe(true);
  });

  it("is true when the reader is mismatched", () => {
    expect(isSerialDeviceMissing(standings(MATCHING, { kind: "mismatched" }))).toBe(true);
  });
});
