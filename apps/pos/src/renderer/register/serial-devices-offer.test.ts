import type { RegisterStatus } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { SignedInPerson } from "../shell/signed-in-person";
import { landsOnSerialDevices } from "./serial-devices-offer";

const CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_serial_devices"],
};
const CASHIER: SignedInPerson = {
  user_id: "u2",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};

function statusWith(serial_devices: RegisterStatus["serial_devices"]): RegisterStatus {
  return { conditions: [], cloud: "reachable", serial_devices };
}

const NEITHER_REGISTERED = statusWith({ scale: "not_registered", reader: "not_registered" });

describe("landsOnSerialDevices", () => {
  it("lands a person who may configure the devices on them while neither is registered", () => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status: NEITHER_REGISTERED })).toBe(true);
  });

  it.each([
    statusWith({ scale: "matching", reader: "not_registered" }),
    statusWith({ scale: "not_registered", reader: "not_detected" }),
    statusWith({ scale: "mismatched", reader: "matching" }),
    statusWith({ scale: "matching", reader: "matching" }),
  ])("does not land on them once either is registered: %j", (status) => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status })).toBe(false);
  });

  it("does not land a person who may not configure the devices", () => {
    expect(landsOnSerialDevices({ person: CASHIER, status: NEITHER_REGISTERED })).toBe(false);
  });

  it("does not land anyone while the status is not known", () => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status: undefined })).toBe(false);
  });

  it("does not land a person who chose Ahora no", () => {
    expect(
      landsOnSerialDevices({ person: CONFIGURER, status: NEITHER_REGISTERED, dismissed: true }),
    ).toBe(false);
  });
});
