import { describe, expect, it } from "vitest";
import { RAW_PRINTING_PORT, reachSameReceiptPrinter } from "./receipt-printer-endpoint";

describe("reachSameReceiptPrinter", () => {
  it("answers true for the same host and port", () => {
    expect(
      reachSameReceiptPrinter(
        { host: "10.10.10.2", port: 9101 },
        { host: "10.10.10.2", port: 9101 },
      ),
    ).toBe(true);
  });

  it("answers true for a host name written in another case", () => {
    expect(
      reachSameReceiptPrinter(
        { host: "Ticketera.LOCAL", port: null },
        { host: "ticketera.local", port: null },
      ),
    ).toBe(true);
  });

  it("reads an address with no port as one on the raw printing port, either way round", () => {
    const withoutPort = { host: "10.10.10.2", port: null };
    const onRawPrintingPort = { host: "10.10.10.2", port: RAW_PRINTING_PORT };

    expect(reachSameReceiptPrinter(withoutPort, onRawPrintingPort)).toBe(true);
    expect(reachSameReceiptPrinter(onRawPrintingPort, withoutPort)).toBe(true);
  });

  it("answers false for an address with no port and one on another port", () => {
    expect(
      reachSameReceiptPrinter(
        { host: "10.10.10.2", port: null },
        { host: "10.10.10.2", port: 9101 },
      ),
    ).toBe(false);
  });

  it("answers false for another host", () => {
    expect(
      reachSameReceiptPrinter(
        { host: "10.10.10.2", port: 9100 },
        { host: "10.10.10.3", port: 9100 },
      ),
    ).toBe(false);
  });

  it("answers false for another port", () => {
    expect(
      reachSameReceiptPrinter(
        { host: "10.10.10.2", port: 9100 },
        { host: "10.10.10.2", port: 9101 },
      ),
    ).toBe(false);
  });
});
