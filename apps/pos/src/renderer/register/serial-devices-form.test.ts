import { registerRendererToCoreMessageSchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  NOT_ASSIGNED,
  SAME_SERIAL_DEVICE_MESSAGE,
  savedSerialDevicesDescription,
  serialDeviceOptions,
  serialDevicesFormFrom,
  serialDevicesRequestFrom,
  serialDevicesRequestSchema,
} from "./serial-devices-form";

const SCALE = { path: "COM3", vendor_id: "0403", product_id: "6001" };
const READER = { path: "COM4", vendor_id: "05e0", product_id: "1200" };
const SECOND_SCALE_PORT = { path: "COM7", vendor_id: "0403", product_id: "6001" };

const SCALE_IDENTITY = { vendor_id: "0403", product_id: "6001" };
const READER_IDENTITY = { vendor_id: "05e0", product_id: "1200" };

describe("serialDeviceOptions", () => {
  it("offers leaving an unregistered role unassigned first, then each detected device by its identity and port", () => {
    expect(serialDeviceOptions("scale", { registered: {}, detected: [SCALE, READER] })).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
      { value: "0403:6001", label: "0403:6001 (COM3)" },
      { value: "05e0:1200", label: "05e0:1200 (COM4)" },
    ]);
  });

  it("offers a device once however many ports show its identity, naming the first port", () => {
    expect(
      serialDeviceOptions("scale", { registered: {}, detected: [SCALE, SECOND_SCALE_PORT] }),
    ).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
      { value: "0403:6001", label: "0403:6001 (COM3)" },
    ]);
  });

  it("offers only leaving an unregistered role unassigned when no device is detected", () => {
    expect(serialDeviceOptions("reader", { registered: {}, detected: [] })).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
    ]);
  });

  it("offers no way to leave a registered role unassigned", () => {
    expect(
      serialDeviceOptions("scale", { registered: { scale: SCALE_IDENTITY }, detected: [SCALE] }),
    ).toEqual([{ value: "0403:6001", label: "0403:6001 (COM3)" }]);
  });

  it("offers a role's registered device that is not connected first, saying so", () => {
    expect(
      serialDeviceOptions("scale", { registered: { scale: SCALE_IDENTITY }, detected: [READER] }),
    ).toEqual([
      { value: "0403:6001", label: "0403:6001 (no conectado)" },
      { value: "05e0:1200", label: "05e0:1200 (COM4)" },
    ]);
  });

  it("offers the other role's registered device only when it is connected", () => {
    expect(
      serialDeviceOptions("reader", { registered: { scale: SCALE_IDENTITY }, detected: [READER] }),
    ).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
      { value: "05e0:1200", label: "05e0:1200 (COM4)" },
    ]);
  });
});

describe("serialDevicesFormFrom", () => {
  it("chooses the device each registered role is registered with", () => {
    expect(serialDevicesFormFrom({ scale: SCALE_IDENTITY, reader: READER_IDENTITY })).toEqual({
      scale: "0403:6001",
      reader: "05e0:1200",
    });
  });

  it("leaves a role unassigned when it has no registration", () => {
    expect(serialDevicesFormFrom({})).toEqual({ scale: NOT_ASSIGNED, reader: NOT_ASSIGNED });
  });

  it("keeps choosing a registered device that is not connected", () => {
    expect(serialDevicesFormFrom({ scale: SCALE_IDENTITY })).toEqual({
      scale: "0403:6001",
      reader: NOT_ASSIGNED,
    });
  });
});

describe("savedSerialDevicesDescription", () => {
  it.each([
    { devices: { scale: SCALE_IDENTITY }, description: "La caja reconoce la balanza elegida." },
    { devices: { reader: READER_IDENTITY }, description: "La caja reconoce el lector elegido." },
    {
      devices: { scale: SCALE_IDENTITY, reader: READER_IDENTITY },
      description: "La caja reconoce la balanza y el lector elegidos.",
    },
  ])("describes what was registered as '$description'", ({ devices, description }) => {
    expect(savedSerialDevicesDescription(devices)).toBe(description);
  });

  it("describes nothing when no device was registered", () => {
    expect(savedSerialDevicesDescription({})).toBeUndefined();
  });
});

describe("serialDevicesRequestFrom", () => {
  it("sends the identity chosen for each role", () => {
    expect(serialDevicesRequestFrom({ scale: "0403:6001", reader: "05e0:1200" })).toEqual({
      devices: {
        scale: { vendor_id: "0403", product_id: "6001" },
        reader: { vendor_id: "05e0", product_id: "1200" },
      },
    });
  });

  it("leaves out a role left unassigned", () => {
    expect(serialDevicesRequestFrom({ scale: NOT_ASSIGNED, reader: "05e0:1200" })).toEqual({
      devices: { reader: { vendor_id: "05e0", product_id: "1200" } },
    });
    expect(serialDevicesRequestFrom({ scale: NOT_ASSIGNED, reader: NOT_ASSIGNED })).toEqual({
      devices: {},
    });
  });

  it.each([
    { scale: "0403:6001", reader: NOT_ASSIGNED },
    { scale: NOT_ASSIGNED, reader: NOT_ASSIGNED },
    { scale: "0403:6001", reader: "05e0:1200" },
  ])("builds a request the register-serial-devices message accepts: %j", (values) => {
    const { devices } = serialDevicesRequestFrom(values);

    expect(serialDevicesRequestSchema.safeParse({ devices }).success).toBe(true);
    expect(
      registerRendererToCoreMessageSchema.safeParse({
        type: "register-serial-devices",
        request_id: "r1",
        devices,
      }).success,
    ).toBe(true);
  });
});

it("tells that one device cannot be both the scale and the reader", () => {
  expect(SAME_SERIAL_DEVICE_MESSAGE).toBe(
    "La balanza y el lector no pueden ser el mismo dispositivo.",
  );
});
