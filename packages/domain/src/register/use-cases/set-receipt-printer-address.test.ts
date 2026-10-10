import { describe, expect, it } from "vitest";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import { readReceiptPrinterAddress } from "./read-receipt-printer-address.js";
import { setReceiptPrinterAddress } from "./set-receipt-printer-address.js";
import { FakeReceiptPrinterSettings } from "./test-support/fake-receipt-printer-settings.js";
import { granting, refusing } from "./test-support/fake-operation-authority.js";

const ADDRESS: ReceiptPrinterAddress = { host: "192.168.1.50", port: 9100 };
const OTHER_ADDRESS: ReceiptPrinterAddress = { host: "printer.local", port: null };
const LACKS_PERMISSION = { kind: "lacks_permission" } as const;
const GRANT = { actorId: "ana" };

describe("setReceiptPrinterAddress", () => {
  it("saves the address and answers it", async () => {
    const settings = new FakeReceiptPrinterSettings();

    const outcome = await setReceiptPrinterAddress(
      { settings, authority: granting(GRANT) },
      { address: ADDRESS },
    );

    expect(outcome).toEqual({ kind: "saved", address: ADDRESS });
    expect(settings.receiptPrinterAddress()).toEqual(ADDRESS);
  });

  it("replaces the address saved before", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);

    await setReceiptPrinterAddress(
      { settings, authority: granting(GRANT) },
      { address: OTHER_ADDRESS },
    );

    expect(settings.receiptPrinterAddress()).toEqual(OTHER_ADDRESS);
  });

  it("returns the refusal and saves nothing when the authority refuses", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);
    const authority = refusing(LACKS_PERMISSION);

    const outcome = await setReceiptPrinterAddress(
      { settings, authority },
      { address: OTHER_ADDRESS },
    );

    expect(outcome).toEqual(LACKS_PERMISSION);
    expect(authority.asked).toBe(1);
    expect(settings.saves).toBe(0);
    expect(settings.receiptPrinterAddress()).toEqual(ADDRESS);
  });
});

describe("readReceiptPrinterAddress", () => {
  it("answers the configured address", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);

    expect(await readReceiptPrinterAddress({ settings, authority: granting(GRANT) })).toEqual({
      kind: "configured",
      address: ADDRESS,
    });
  });

  it("answers that no printer is configured when none was saved", async () => {
    const settings = new FakeReceiptPrinterSettings();

    expect(await readReceiptPrinterAddress({ settings, authority: granting(GRANT) })).toEqual({
      kind: "not_configured",
    });
  });

  it("returns the refusal without reading the settings when the authority refuses", async () => {
    const settings = new FakeReceiptPrinterSettings(ADDRESS);

    const outcome = await readReceiptPrinterAddress({
      settings,
      authority: refusing(LACKS_PERMISSION),
    });

    expect(outcome).toEqual(LACKS_PERMISSION);
    expect(settings.reads).toBe(0);
  });
});
