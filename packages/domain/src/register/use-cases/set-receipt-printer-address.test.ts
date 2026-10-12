import { describe, expect, it } from "vitest";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import { setReceiptPrinterAddress } from "./set-receipt-printer-address.js";
import { granting, refusing } from "./test-support/fake-operation-authority.js";
import { FakeReceiptPrinterReplacement } from "./test-support/fake-receipt-printer-replacement.js";
import { FakeReceiptPrinterSettings } from "./test-support/fake-receipt-printer-settings.js";

const ADDRESS: ReceiptPrinterAddress = { host: "192.168.1.50", port: 9100 };
const OTHER_ADDRESS: ReceiptPrinterAddress = { host: "printer.local", port: null };
const LACKS_PERMISSION = { kind: "lacks_permission" } as const;
const GRANT = { actorId: "ana" };

describe("setReceiptPrinterAddress", () => {
  it("saves the address and answers it", async () => {
    const settings = new FakeReceiptPrinterSettings();

    const outcome = await setReceiptPrinterAddress(
      {
        settings,
        authority: granting(GRANT),
        replacement: new FakeReceiptPrinterReplacement(settings),
      },
      { address: ADDRESS },
    );

    expect(outcome).toEqual({ kind: "saved", address: ADDRESS });
    expect(settings.receiptPrinterAddress()).toEqual(ADDRESS);
  });

  it("replaces the address saved before", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);

    await setReceiptPrinterAddress(
      {
        settings,
        authority: granting(GRANT),
        replacement: new FakeReceiptPrinterReplacement(settings),
      },
      { address: OTHER_ADDRESS },
    );

    expect(settings.receiptPrinterAddress()).toEqual(OTHER_ADDRESS);
  });

  it("returns the refusal and saves nothing when the authority refuses", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);
    const authority = refusing(LACKS_PERMISSION);

    const replacement = new FakeReceiptPrinterReplacement(settings);

    const outcome = await setReceiptPrinterAddress(
      { settings, authority, replacement },
      { address: OTHER_ADDRESS },
    );

    expect(outcome).toEqual(LACKS_PERMISSION);
    expect(replacement.savesSeenAtEachReplacement).toEqual([]);
    expect(authority.asked).toBe(1);
    expect(settings.saves).toBe(0);
    expect(settings.receiptPrinterAddress()).toEqual(ADDRESS);
  });

  it("announces the replaced printer once, after saving a different address", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);
    const replacement = new FakeReceiptPrinterReplacement(settings);

    await setReceiptPrinterAddress(
      { settings, authority: granting(GRANT), replacement },
      { address: OTHER_ADDRESS },
    );

    expect(replacement.savesSeenAtEachReplacement).toEqual([1]);
  });

  it("announces the replaced printer when the first address is saved", async () => {
    const settings = new FakeReceiptPrinterSettings();
    const replacement = new FakeReceiptPrinterReplacement(settings);

    await setReceiptPrinterAddress(
      { settings, authority: granting(GRANT), replacement },
      { address: ADDRESS },
    );

    expect(replacement.savesSeenAtEachReplacement).toEqual([1]);
  });

  it("announces no replacement when the address saved is the one already stored", async () => {
    const settings = new FakeReceiptPrinterSettings({ host: "Printer.Local", port: null });
    const replacement = new FakeReceiptPrinterReplacement(settings);

    const outcome = await setReceiptPrinterAddress(
      { settings, authority: granting(GRANT), replacement },
      { address: OTHER_ADDRESS },
    );

    expect(outcome).toEqual({ kind: "saved", address: OTHER_ADDRESS });
    expect(replacement.savesSeenAtEachReplacement).toEqual([]);
  });
});
