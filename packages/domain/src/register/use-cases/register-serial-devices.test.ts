import { describe, expect, it } from "vitest";
import type { SerialDeviceIdentity } from "../model/serial-devices.js";
import { registerSerialDevices } from "./register-serial-devices.js";
import { granting, refusing } from "./test-support/fake-operation-authority.js";
import { FakeSerialDeviceRegistrations } from "./test-support/fake-serial-device-registrations.js";

const SCALE: SerialDeviceIdentity = { vendorId: "0403", productId: "6001" };
const OTHER_SCALE: SerialDeviceIdentity = { vendorId: "067b", productId: "2303" };
const READER: SerialDeviceIdentity = { vendorId: "05e0", productId: "1200" };
const LACKS_PERMISSION = { kind: "lacks_permission" } as const;
const GRANT = { actorId: "ana" };

describe("registerSerialDevices", () => {
  it("registers both devices and answers them", async () => {
    const registrations = new FakeSerialDeviceRegistrations();

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { scale: SCALE, reader: READER } },
    );

    expect(outcome).toEqual({ kind: "registered", devices: { scale: SCALE, reader: READER } });
    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE, reader: READER });
  });

  it("registers only the scale, leaving the reader without an entry", async () => {
    const registrations = new FakeSerialDeviceRegistrations();

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { scale: SCALE } },
    );

    expect(outcome).toStrictEqual({ kind: "registered", devices: { scale: SCALE } });
    expect(registrations.registeredSerialDevices()).toStrictEqual({ scale: SCALE });
  });

  it("registers only the reader, leaving the scale without an entry", async () => {
    const registrations = new FakeSerialDeviceRegistrations();

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { reader: READER } },
    );

    expect(outcome).toStrictEqual({ kind: "registered", devices: { reader: READER } });
    expect(registrations.registeredSerialDevices()).toStrictEqual({ reader: READER });
  });

  it("keeps the reader when only the scale is replaced", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE, reader: READER });

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { scale: OTHER_SCALE } },
    );

    expect(outcome).toEqual({
      kind: "registered",
      devices: { scale: OTHER_SCALE, reader: READER },
    });
    expect(registrations.registeredSerialDevices()).toEqual({
      scale: OTHER_SCALE,
      reader: READER,
    });
  });

  it("keeps the scale when only the reader is registered", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE });

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { reader: READER } },
    );

    expect(outcome).toEqual({ kind: "registered", devices: { scale: SCALE, reader: READER } });
  });

  it("reads the registrations it checks against and saves them in one transaction", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE });

    await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { reader: READER } },
    );

    expect(registrations.transactions).toBe(1);
    expect(registrations.readsOutsideTransactions).toBe(0);
    expect(registrations.saves).toBe(1);
  });

  it("refuses the same identity for both and saves nothing", async () => {
    const registrations = new FakeSerialDeviceRegistrations();

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { scale: SCALE, reader: { ...SCALE } } },
    );

    expect(outcome).toEqual({ kind: "same_identity_for_both" });
    expect(registrations.saves).toBe(0);
    expect(registrations.registeredSerialDevices()).toEqual({});
  });

  it("refuses a new reader equal to the scale already registered", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE });

    const outcome = await registerSerialDevices(
      { registrations, authority: granting(GRANT) },
      { devices: { reader: SCALE } },
    );

    expect(outcome).toEqual({ kind: "same_identity_for_both" });
    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE });
  });

  it("returns the refusal and reads and saves nothing when the authority refuses", async () => {
    const registrations = new FakeSerialDeviceRegistrations({ scale: SCALE });
    const authority = refusing(LACKS_PERMISSION);

    const outcome = await registerSerialDevices(
      { registrations, authority },
      { devices: { reader: READER } },
    );

    expect(outcome).toEqual(LACKS_PERMISSION);
    expect(authority.asked).toBe(1);
    expect(registrations.transactions).toBe(0);
  });
});
