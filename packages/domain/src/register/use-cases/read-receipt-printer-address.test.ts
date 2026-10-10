import { describe, expect, it } from "vitest";
import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";
import { readReceiptPrinterAddress } from "./read-receipt-printer-address.js";
import { granting, refusing } from "./test-support/fake-operation-authority.js";
import { FakeReceiptPrinterSettings } from "./test-support/fake-receipt-printer-settings.js";

const ADDRESS: ReceiptPrinterAddress = { host: "192.168.1.50", port: 9100 };
const LACKS_PERMISSION = { kind: "lacks_permission" } as const;
const GRANT = { actorId: "ana" };

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
