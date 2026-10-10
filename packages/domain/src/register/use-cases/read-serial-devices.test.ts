import { describe, expect, it } from "vitest";
import type { DetectedSerialDevice, SerialDeviceIdentity } from "../model/serial-devices.js";
import { readSerialDevices } from "./read-serial-devices.js";
import { granting, refusing } from "./test-support/fake-operation-authority.js";
import { FakeSerialDeviceEnumeration } from "./test-support/fake-serial-device-enumeration.js";
import { FakeSerialDeviceRegistrations } from "./test-support/fake-serial-device-registrations.js";

const SCALE: SerialDeviceIdentity = { vendorId: "0403", productId: "6001" };
const READER: SerialDeviceIdentity = { vendorId: "05e0", productId: "1200" };
const LACKS_PERMISSION = { kind: "lacks_permission" } as const;
const GRANT = { actorId: "ana" };

describe("readSerialDevices", () => {
  it("answers what is registered, what is connected and how each registered device stands", async () => {
    const connected: DetectedSerialDevice[] = [{ path: "COM3", identity: SCALE }];

    const outcome = await readSerialDevices({
      registrations: new FakeSerialDeviceRegistrations({ scale: SCALE, reader: READER }),
      enumeration: new FakeSerialDeviceEnumeration(connected),
      authority: granting(GRANT),
    });

    expect(outcome).toEqual({
      kind: "read",
      registered: { scale: SCALE, reader: READER },
      detected: connected,
      standings: {
        scale: { kind: "matching", path: "COM3" },
        reader: { kind: "not_detected" },
      },
    });
  });

  it("returns the refusal and reads nothing when the authority refuses", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE });
    const enumeration = new FakeSerialDeviceEnumeration();
    const authority = refusing(LACKS_PERMISSION);

    const outcome = await readSerialDevices({ registrations, enumeration, authority });

    expect(outcome).toEqual(LACKS_PERMISSION);
    expect(authority.asked).toBe(1);
    expect(registrations.reads).toBe(0);
    expect(enumeration.enumerations).toBe(0);
  });
});
