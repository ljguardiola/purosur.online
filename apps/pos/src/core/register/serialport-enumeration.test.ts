import { describe, expect, it, vi } from "vitest";
import { listSerialPorts, serialportEnumeration } from "./serialport-enumeration";

function enumerationOf(ports: Awaited<ReturnType<typeof listSerialPorts>>) {
  return serialportEnumeration({
    list: async () => ports,
    reportFailure: () => undefined,
    onListed: () => undefined,
  });
}

describe("the serial devices detected through serialport", () => {
  it("names each port with a vendor and a product by that identity and its path", async () => {
    const enumeration = enumerationOf([
      { path: "COM3", vendorId: "26f1", productId: "8802" },
      { path: "COM7", vendorId: "1a86", productId: "7523" },
    ]);

    expect(await enumeration.detectedSerialDevices()).toEqual([
      { path: "COM3", identity: { vendorId: "26f1", productId: "8802" } },
      { path: "COM7", identity: { vendorId: "1a86", productId: "7523" } },
    ]);
  });

  it("reads an uppercase identity, as Windows reports it, in lowercase", async () => {
    const enumeration = enumerationOf([{ path: "COM3", vendorId: "26F1", productId: "AB0C" }]);

    expect(await enumeration.detectedSerialDevices()).toEqual([
      { path: "COM3", identity: { vendorId: "26f1", productId: "ab0c" } },
    ]);
  });

  it("leaves out a port that does not report both a vendor and a product", async () => {
    const enumeration = enumerationOf([
      { path: "COM1" },
      { path: "COM2", vendorId: "26f1" },
      { path: "COM4", productId: "8802" },
    ]);

    expect(await enumeration.detectedSerialDevices()).toEqual([]);
  });

  it("leaves out a port whose vendor or product is not four hexadecimal digits", async () => {
    const enumeration = enumerationOf([
      { path: "COM1", vendorId: "26f", productId: "8802" },
      { path: "COM2", vendorId: "26f1", productId: "88020" },
      { path: "COM4", vendorId: "26g1", productId: "8802" },
    ]);

    expect(await enumeration.detectedSerialDevices()).toEqual([]);
  });

  it("detects two ports of one identity separately, by their paths", async () => {
    const enumeration = enumerationOf([
      { path: "COM3", vendorId: "1a86", productId: "7523" },
      { path: "COM9", vendorId: "1a86", productId: "7523" },
    ]);

    expect((await enumeration.detectedSerialDevices()).map(({ path }) => path)).toEqual([
      "COM3",
      "COM9",
    ]);
  });

  it("says once, after the first listing it manages, that serial devices were listed", async () => {
    const onListed = vi.fn();
    const enumeration = serialportEnumeration({
      list: async () => [],
      reportFailure: () => undefined,
      onListed,
    });

    await enumeration.detectedSerialDevices();
    await enumeration.detectedSerialDevices();

    expect(onListed).toHaveBeenCalledTimes(1);
  });

  it("detects no device and reports the failure when serialport cannot list", async () => {
    const failure = new Error("the binding did not load");
    const reportFailure = vi.fn();
    const onListed = vi.fn();
    const enumeration = serialportEnumeration({
      list: async () => {
        throw failure;
      },
      reportFailure,
      onListed,
    });

    expect(await enumeration.detectedSerialDevices()).toEqual([]);
    expect(reportFailure).toHaveBeenCalledWith(failure);
    expect(onListed).not.toHaveBeenCalled();
  });

  it("reports a failure that goes on only once, and reports it again after listing works", async () => {
    let failing = true;
    const reportFailure = vi.fn();
    const enumeration = serialportEnumeration({
      list: async () => {
        if (failing) {
          throw new Error("unplugged adapter");
        }
        return [];
      },
      reportFailure,
      onListed: () => undefined,
    });

    await enumeration.detectedSerialDevices();
    await enumeration.detectedSerialDevices();
    expect(reportFailure).toHaveBeenCalledTimes(1);

    failing = false;
    await enumeration.detectedSerialDevices();
    failing = true;
    await enumeration.detectedSerialDevices();
    expect(reportFailure).toHaveBeenCalledTimes(2);
  });

  it("loads the serialport binding of this machine and lists its ports", async () => {
    expect(Array.isArray(await listSerialPorts())).toBe(true);
  });
});
