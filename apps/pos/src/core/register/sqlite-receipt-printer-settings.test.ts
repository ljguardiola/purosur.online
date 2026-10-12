import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteReceiptPrinterSettings } from "./sqlite-receipt-printer-settings";

let database: LocalDatabase;
let settings: SqliteReceiptPrinterSettings;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  settings = new SqliteReceiptPrinterSettings(database);
});

afterEach(() => {
  database.close();
});

describe("SqliteReceiptPrinterSettings", () => {
  it("has no address until one is saved", () => {
    expect(settings.receiptPrinterAddress()).toBeUndefined();
  });

  it("reads back a saved address with its port", () => {
    settings.saveReceiptPrinterAddress({ host: "10.10.10.2", port: 9100 });

    expect(settings.receiptPrinterAddress()).toEqual({ host: "10.10.10.2", port: 9100 });
  });

  it("reads back a saved address with no port", () => {
    settings.saveReceiptPrinterAddress({ host: "ticketera", port: null });

    expect(settings.receiptPrinterAddress()).toEqual({ host: "ticketera", port: null });
  });

  it("replaces the address it already holds", () => {
    settings.saveReceiptPrinterAddress({ host: "10.10.10.2", port: 9100 });
    settings.saveReceiptPrinterAddress({ host: "10.10.10.9", port: null });

    expect(settings.receiptPrinterAddress()).toEqual({ host: "10.10.10.9", port: null });
    expect(database.prepare("SELECT COUNT(*) AS rows FROM receipt_printer").get()).toEqual({
      rows: 1,
    });
  });
});
