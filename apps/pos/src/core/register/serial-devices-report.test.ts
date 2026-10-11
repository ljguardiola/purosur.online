import { describe, expect, it } from "vitest";
import { serialDevicesReportOf } from "./serial-devices-report";

const SCALE = { vendorId: "1a86", productId: "7523" };
const READER = { vendorId: "26f1", productId: "8802" };

describe("the report of the register's serial devices", () => {
  it("reports a matching scale with its identity and a reader that is not detected with its own", () => {
    const report = serialDevicesReportOf({
      kind: "listed",
      standings: {
        scale: { kind: "matching", path: "/dev/ttyUSB0" },
        reader: { kind: "not_detected" },
      },
      registered: { scale: SCALE, reader: READER },
    });

    expect(report).toEqual({
      scale: { standing: "matching", vendor_id: "1a86", product_id: "7523" },
      reader: { standing: "not_detected", vendor_id: "26f1", product_id: "8802" },
    });
  });

  it("does not report the path of a matching device", () => {
    const report = serialDevicesReportOf({
      kind: "listed",
      standings: {
        scale: { kind: "matching", path: "/dev/ttyUSB0" },
        reader: { kind: "mismatched" },
      },
      registered: { scale: SCALE, reader: READER },
    });

    expect(JSON.stringify(report)).not.toContain("ttyUSB0");
    expect(report.reader.standing).toBe("mismatched");
  });

  it("reports a role without registration with no identity", () => {
    const report = serialDevicesReportOf({
      kind: "listed",
      standings: { scale: { kind: "not_detected" }, reader: { kind: "not_registered" } },
      registered: { scale: SCALE },
    });

    expect(report).toEqual({
      scale: { standing: "not_detected", vendor_id: "1a86", product_id: "7523" },
      reader: { standing: "not_registered" },
    });
  });

  it("reports the devices as unknown before the first listing, with the registered identities", () => {
    const report = serialDevicesReportOf({ kind: "unknown", registered: { scale: SCALE } });

    expect(report).toEqual({
      scale: { standing: "unknown", vendor_id: "1a86", product_id: "7523" },
      reader: { standing: "not_registered" },
    });
  });

  it("reports unknown devices without identity when the registrations can't be read", () => {
    const report = serialDevicesReportOf({ kind: "unreadable" });

    expect(report).toEqual({ scale: { standing: "unknown" }, reader: { standing: "unknown" } });
  });
});
