import { randomBytes } from "node:crypto";
import type { FiscalEmissionMode } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { ControllableReceiptPrinter } from "../sales/test-support/controllable-receipt-printer";
import { ManualTimers } from "../sales/test-support/manual-timers";
import { appendOutboxEvents, openOutboxDatabase } from "../sync/test-support/sqlite-local-outbox";
import { createContingencyBackupTickets } from "./contingency-backup-tickets-wiring";

const NOW = new Date("2026-10-09T15:07:00.000Z");
const INTERVAL_MS = 30_000;

let database: LocalDatabase;
let device: ControllableReceiptPrinter | undefined;
let mode: FiscalEmissionMode;
let key: { version: number; key: string } | undefined;
let reported: { context: string; error: unknown }[];
let timers: ManualTimers;
let nextId: number;

function tickets() {
  return createContingencyBackupTickets({
    database,
    now: () => NOW,
    ids: { next: () => `ticket-${++nextId}` },
    readContingencyTicketKey: async () => key,
    appVersion: "1.4.0",
    readEmissionMode: () => mode,
    printers: { configured: () => device },
    scheduleNext: (run, delayMs) => timers.after(delayMs, run),
    intervalMs: INTERVAL_MS,
    reportFailure: (context, error) => reported.push({ context, error }),
  });
}

function appendingEvents(count: number) {
  return async () => {
    appendOutboxEvents(database, count);
    return { kind: "recorded" } as const;
  };
}

beforeEach(() => {
  database = openOutboxDatabase();
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('018f0000-0000-7000-8000-00000000aaaa', 'Caja 1', 1, 0);
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1)`,
  );
  device = new ControllableReceiptPrinter();
  mode = { kind: "offline_code", cause: "no_connectivity" };
  key = { version: 1, key: randomBytes(32).toString("base64") };
  reported = [];
  timers = new ManualTimers();
  nextId = 0;
});

afterEach(() => {
  database.close();
});

describe("the contingency backup tickets of the register", () => {
  it("records the events of an operation in a gap, prints the ticket and then lets it be discarded once synced", async () => {
    const { ticketed, requests, worker } = tickets();

    await ticketed("cash_session_opening", appendingEvents(2))?.();
    await device?.whenWaiting();
    device?.becomeReady();
    await worker.kick();

    expect(reported).toEqual([]);
    expect(await requests.read()).toMatchObject({
      kind: "read",
      tickets: { to_print: 0, kept: 1, discardable: 0 },
    });
    expect(Buffer.from(device?.handed[0] ?? []).toString("latin1")).toContain("Apertura de caja");

    database.prepare("UPDATE outbox SET acked_at = '2026-10-09T16:00:00.000Z'").run();

    expect(await requests.discard()).toEqual({ kind: "discarded", count: 1 });
  });

  it("records no ticket for an operation outside a gap", async () => {
    mode = { kind: "real_time" };
    const { ticketed, requests } = tickets();

    await ticketed("cash_session_opening", appendingEvents(2))?.();

    expect(await requests.read()).toMatchObject({
      tickets: { to_print: 0, kept: 0, missing_key: 0, discardable: 0 },
    });
  });

  it("keeps the ticket of an operation as missing its key when the register holds none", async () => {
    key = undefined;
    const { ticketed, requests } = tickets();

    await ticketed("cash_session_opening", appendingEvents(2))?.();

    expect(await requests.read()).toMatchObject({ tickets: { missing_key: 1, to_print: 0 } });
  });

  it("leaves the ticket pending, naming the printer, while no printer is configured", async () => {
    device = undefined;
    const { ticketed, requests } = tickets();

    await ticketed("cash_session_opening", appendingEvents(2))?.();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(await requests.read()).toMatchObject({
      tickets: { to_print: 1, printer: "printer_not_configured" },
    });
  });

  it("prints a pending ticket on the timer once the printer is configured", async () => {
    device = undefined;
    const { ticketed, requests, worker } = tickets();
    worker.start();
    await ticketed("cash_session_opening", appendingEvents(2))?.();
    await worker.kick();
    device = new ControllableReceiptPrinter();
    const printer = device;

    timers.fire(INTERVAL_MS);
    await printer.whenWaiting();
    printer.becomeReady();
    await worker.kick();

    expect(await requests.read()).toMatchObject({ tickets: { to_print: 0, kept: 1 } });
  });
});
