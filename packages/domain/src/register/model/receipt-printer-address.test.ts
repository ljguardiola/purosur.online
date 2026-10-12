import { describe, expect, it } from "vitest";
import { isSameReceiptPrinterAddress } from "./receipt-printer-address.js";

describe("isSameReceiptPrinterAddress", () => {
  it("answers true for the same host and port", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "192.168.1.50", port: 9100 },
        { host: "192.168.1.50", port: 9100 },
      ),
    ).toBe(true);
  });

  it("answers true for the same host without a port", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "printer.local", port: null },
        { host: "printer.local", port: null },
      ),
    ).toBe(true);
  });

  it("answers true for a host name written in another case", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "Printer.LOCAL", port: 515 },
        { host: "printer.local", port: 515 },
      ),
    ).toBe(true);
  });

  it("answers false for another host", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "192.168.1.50", port: 9100 },
        { host: "192.168.1.51", port: 9100 },
      ),
    ).toBe(false);
  });

  it("answers false for another port", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "192.168.1.50", port: 9100 },
        { host: "192.168.1.50", port: 9101 },
      ),
    ).toBe(false);
  });

  it("answers false when only one of them names a port", () => {
    expect(
      isSameReceiptPrinterAddress(
        { host: "192.168.1.50", port: 9100 },
        { host: "192.168.1.50", port: null },
      ),
    ).toBe(false);
  });
});
