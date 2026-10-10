import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  receiptPrinterAddressSchema,
  receiptPrinterAddressTextSchema,
} from "./receipt-printer-address.js";

describe("receiptPrinterAddressTextSchema", () => {
  it.each([
    ["192.168.1.50", { host: "192.168.1.50", port: null }],
    ["192.168.1.50:9100", { host: "192.168.1.50", port: 9100 }],
    ["printer.local", { host: "printer.local", port: null }],
    ["printer.local:515", { host: "printer.local", port: 515 }],
    ["  192.168.1.50:9100  ", { host: "192.168.1.50", port: 9100 }],
    ["printer:1", { host: "printer", port: 1 }],
    ["printer:65535", { host: "printer", port: 65535 }],
  ])("reads %j as an address", (text, address) => {
    expect(receiptPrinterAddressTextSchema.parse(text)).toEqual(address);
  });

  it.each([
    "",
    "   ",
    ":9100",
    "192.168.1.50:",
    "192.168.1.50:0",
    "192.168.1.50:65536",
    "192.168.1.50:09100",
    "192.168.1.50:91 00",
    "192.168.1.50:-1",
    "192.168.1.50:9100:1",
    "192.168.1.50:99999999999999999999",
    "192.168.1.256",
    "pri nter",
    "-printer",
    "http://printer",
    "[::1]:9100",
  ])("rejects %j", (text) => {
    expect(receiptPrinterAddressTextSchema.safeParse(text).success).toBe(false);
  });

  it("rejects what is not text", () => {
    expect(receiptPrinterAddressTextSchema.safeParse(9100).success).toBe(false);
    expect(receiptPrinterAddressTextSchema.safeParse(undefined).success).toBe(false);
  });

  it("reads back the host and port written for any valid address", () => {
    fc.assert(
      fc.property(
        fc.tuple(...Array.from({ length: 4 }, () => fc.integer({ min: 0, max: 255 }))),
        fc.integer({ min: 1, max: 65535 }),
        (octets, port) => {
          const host = octets.join(".");

          expect(receiptPrinterAddressTextSchema.parse(`${host}:${port}`)).toEqual({ host, port });
        },
      ),
    );
  });
});

describe("receiptPrinterAddressSchema", () => {
  it.each([
    { host: "192.168.1.50", port: 9100 },
    { host: "printer.local", port: null },
  ])("accepts %j", (address) => {
    expect(receiptPrinterAddressSchema.parse(address)).toEqual(address);
  });

  it.each([
    { host: "192.168.1.50" },
    { host: "", port: null },
    { host: "192.168.1.256", port: null },
    { host: "printer", port: 0 },
    { host: "printer", port: 65536 },
    { host: "printer", port: 1.5 },
    { host: "printer", port: "9100" },
  ])("rejects %j", (address) => {
    expect(receiptPrinterAddressSchema.safeParse(address).success).toBe(false);
  });
});
