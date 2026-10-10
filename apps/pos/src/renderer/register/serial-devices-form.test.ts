import { registerRendererToCoreMessageSchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  NOT_ASSIGNED,
  SAME_SERIAL_DEVICE_MESSAGE,
  serialDeviceOptions,
  serialDevicesFormFrom,
  serialDevicesRequestFrom,
  serialDevicesRequestSchema,
} from "./serial-devices-form";

const SCALE = { path: "COM3", vendor_id: "0403", product_id: "6001" };
const READER = { path: "COM4", vendor_id: "05e0", product_id: "1200" };
const SECOND_SCALE_PORT = { path: "COM7", vendor_id: "0403", product_id: "6001" };

describe("serialDeviceOptions", () => {
  it("offers leaving a role unassigned first, then each detected device by its identity and port", () => {
    expect(serialDeviceOptions([SCALE, READER])).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
      { value: "0403:6001", label: "0403:6001 (COM3)" },
      { value: "05e0:1200", label: "05e0:1200 (COM4)" },
    ]);
  });

  it("offers a device once however many ports show its identity, naming the first port", () => {
    expect(serialDeviceOptions([SCALE, SECOND_SCALE_PORT])).toEqual([
      { value: NOT_ASSIGNED, label: "Sin asignar" },
      { value: "0403:6001", label: "0403:6001 (COM3)" },
    ]);
  });

  it("offers only leaving the roles unassigned when no device is detected", () => {
    expect(serialDeviceOptions([])).toEqual([{ value: NOT_ASSIGNED, label: "Sin asignar" }]);
  });
});

describe("serialDevicesFormFrom", () => {
  it("chooses the detected device each registered role is registered with", () => {
    expect(
      serialDevicesFormFrom(
        {
          scale: { vendor_id: "0403", product_id: "6001" },
          reader: { vendor_id: "05e0", product_id: "1200" },
        },
        [SCALE, READER],
      ),
    ).toEqual({ scale: "0403:6001", reader: "05e0:1200" });
  });

  it("leaves a role unassigned when it has no registration", () => {
    expect(serialDevicesFormFrom({}, [SCALE, READER])).toEqual({
      scale: NOT_ASSIGNED,
      reader: NOT_ASSIGNED,
    });
  });

  it("leaves a role unassigned when its registered device is not detected", () => {
    expect(
      serialDevicesFormFrom({ scale: { vendor_id: "0403", product_id: "6001" } }, [READER]),
    ).toEqual({ scale: NOT_ASSIGNED, reader: NOT_ASSIGNED });
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
