import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidReceiptPrinterHost, isValidReceiptPrinterPort } from "./receipt-printer-address.js";

describe("isValidReceiptPrinterHost", () => {
  it.each([
    "192.168.1.50",
    "0.0.0.0",
    "255.255.255.255",
    "10.0.0.1",
    "printer",
    "printer.local",
    "Cocina-1.tienda.example.com",
    "a",
    "a-b",
    "1printer",
    "123.printer",
  ])("accepts %s", (host) => {
    expect(isValidReceiptPrinterHost(host)).toBe(true);
  });

  it.each([
    "",
    " ",
    "192.168.1",
    "192.168.1.256",
    "256.1.1.1",
    "192.168.1.01",
    "192.168.1.1.1",
    "1.2.3.-4",
    "1234",
    "printer.123",
    "-printer",
    "printer-",
    "pri nter",
    "printer..local",
    ".printer",
    "printer.",
    "pri_nter",
    "impresora.ñ",
    "printer:9100",
    "[::1]",
  ])("rejects %j", (host) => {
    expect(isValidReceiptPrinterHost(host)).toBe(false);
  });

  it("accepts a label of 63 characters and rejects one of 64", () => {
    expect(isValidReceiptPrinterHost("a".repeat(63))).toBe(true);
    expect(isValidReceiptPrinterHost("a".repeat(64))).toBe(false);
  });

  it("accepts a name of 253 characters and rejects one of 254", () => {
    const label = "a".repeat(62);
    const name = (labels: number) => Array.from({ length: labels }, () => label).join(".");

    expect(isValidReceiptPrinterHost(`${name(3)}.${"a".repeat(61)}`)).toBe(true);
    expect(isValidReceiptPrinterHost(`${name(3)}.${"a".repeat(62)}`)).toBe(false);
  });

  it("accepts every IPv4 address written without leading zeros", () => {
    fc.assert(
      fc.property(
        fc.tuple(...Array.from({ length: 4 }, () => fc.integer({ min: 0, max: 255 }))),
        (octets) => {
          expect(isValidReceiptPrinterHost(octets.join("."))).toBe(true);
        },
      ),
    );
  });

  it("rejects a dotted quad with an octet above 255", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 256, max: 999 }),
        (position, octet) => {
          const octets = [1, 2, 3, 4].map(String);
          octets[position] = String(octet);

          expect(isValidReceiptPrinterHost(octets.join("."))).toBe(false);
        },
      ),
    );
  });
});

describe("isValidReceiptPrinterPort", () => {
  it.each([1, 80, 9100, 65535])("accepts %d", (port) => {
    expect(isValidReceiptPrinterPort(port)).toBe(true);
  });

  it.each([0, -1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %d", (port) => {
    expect(isValidReceiptPrinterPort(port)).toBe(false);
  });
});
