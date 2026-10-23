import type { ContingencyBackupPrintFailureReason } from "@purosur/domain";
import type { PrintNextContingencyBackupTicketOutcome } from "@purosur/domain/backups/use-cases";
import { describe, expect, it } from "vitest";
import { ControllableReceiptPrinter } from "../sales/test-support/controllable-receipt-printer";
import { ManualTimers } from "../sales/test-support/manual-timers";
import {
  createContingencyBackupTicketPrinter,
  createContingencyBackupTicketWorker,
} from "./contingency-backup-ticket-printing";
import type { ContingencyBackupTicketPrintout } from "./escpos-contingency-backup-ticket";

const PRINTOUT: ContingencyBackupTicketPrintout = {
  createdAt: new Date("2026-10-09T15:07:00.000Z"),
  branchAddress: "Av. Belgrano 1450",
  registerName: "Caja 1",
  operation: { kind: "numbered", operationNumber: 482 },
  backs: null,
  qrCodes: ["QR-ONE"],
};

function failures() {
  const reported: { context: string; error: unknown }[] = [];
  return {
    reported,
    reportFailure: (context: string, error: unknown) => reported.push({ context, error }),
  };
}

function printerWith(
  deviceOf: () => ControllableReceiptPrinter | undefined,
  printout: () => ContingencyBackupTicketPrintout | undefined = () => PRINTOUT,
) {
  const { reported, reportFailure } = failures();
  const printing = createContingencyBackupTicketPrinter({
    printoutOf: printout,
    printers: { configured: deviceOf },
    reportFailure,
  });
  return { ...printing, reported };
}

describe("printing a ticket on the receipt printer", () => {
  it("sends the rendered ticket and says it was sent", async () => {
    const device = new ControllableReceiptPrinter();
    const { printer } = printerWith(() => device);

    const printing = printer.print("ticket-1");
    await device.whenWaiting();
    device.becomeReady();

    expect(await printing).toEqual({ kind: "sent" });
    expect(device.handed).toHaveLength(1);
    expect(Buffer.from(device.handed[0] ?? []).toString("latin1")).toContain("QR-ONE");
  });

  it("says there is no printer when none is configured", async () => {
    const { printer, printerFailure } = printerWith(() => undefined);

    expect(await printer.print("ticket-1")).toEqual({
      kind: "not_sent",
      reason: "printer_not_configured",
    });
    expect(printerFailure()).toBe("printer_not_configured");
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "keeps %s as the printer's failure while the ticket waits for it",
    async (status) => {
      const device = new ControllableReceiptPrinter();
      const { printer, printerFailure } = printerWith(() => device);

      void printer.print("ticket-1");
      await device.whenWaiting();
      device.report(status);

      expect(printerFailure()).toBe(status);
    },
  );

  it("forgets the failure once the printer is ready and the ticket is sent", async () => {
    const device = new ControllableReceiptPrinter();
    const { printer, printerFailure } = printerWith(() => device);

    const printing = printer.print("ticket-1");
    await device.whenWaiting();
    device.report("paper_out");
    device.becomeReady();
    await printing;

    expect(printerFailure()).toBeNull();
  });

  it("says the ticket was not sent when the print is abandoned", async () => {
    const device = new ControllableReceiptPrinter();
    const { printer } = printerWith(() => device);

    const printing = printer.print("ticket-1");
    await device.whenWaiting();
    device.waiting[0]?.end({ kind: "abandoned" });

    expect(await printing).toEqual({ kind: "not_sent", reason: "failed" });
  });

  it("reports a ticket it cannot render and says so, blaming nothing on the printer", async () => {
    const device = new ControllableReceiptPrinter();
    const { printer, reported, printerFailure } = printerWith(
      () => device,
      () => undefined,
    );

    expect(await printer.print("ticket-1")).toEqual({ kind: "unrenderable" });
    expect(reported).toHaveLength(1);
    expect(printerFailure()).toBeNull();
    expect(device.handed).toHaveLength(0);
  });
});

describe("the worker printing the tickets", () => {
  const INTERVAL_MS = 30_000;

  function workerWith(outcomes: (PrintNextContingencyBackupTicketOutcome | Error)[]) {
    const timers = new ManualTimers();
    const { reported, reportFailure } = failures();
    const calls = { started: 0, running: 0, overlapped: false };
    const releases: (() => void)[] = [];
    const worker = createContingencyBackupTicketWorker({
      printNext: async () => {
        calls.started += 1;
        calls.running += 1;
        if (calls.running > 1) calls.overlapped = true;
        await new Promise<void>((resolve) => releases.push(resolve));
        calls.running -= 1;
        const outcome = outcomes.shift() ?? { kind: "nothing_to_print" };
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      scheduleNext: (run, delayMs) => timers.after(delayMs, run),
      reportFailure,
      intervalMs: INTERVAL_MS,
    });
    async function release(): Promise<void> {
      await new Promise<void>((resolve) => setImmediate(resolve));
      releases.shift()?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { worker, timers, calls, reported, release };
  }

  it("prints tickets one after the other until none is left", async () => {
    const { worker, calls, release } = workerWith([
      { kind: "printed", ticketId: "a" },
      { kind: "printed", ticketId: "b" },
      { kind: "nothing_to_print" },
    ]);

    const drained = worker.kick();
    await release();
    await release();
    await release();
    await drained;

    expect(calls.started).toBe(3);
    expect(calls.overlapped).toBe(false);
  });

  it("never prints two at once and goes over the tickets again when kicked meanwhile", async () => {
    const { worker, calls, release } = workerWith([
      { kind: "nothing_to_print" },
      { kind: "nothing_to_print" },
    ]);

    const first = worker.kick();
    const second = worker.kick();
    await release();
    await release();
    await Promise.all([first, second]);

    expect(calls.started).toBe(2);
    expect(calls.overlapped).toBe(false);
  });

  it("stops at a ticket the printer did not take, leaving it for the next kick", async () => {
    const reason: ContingencyBackupPrintFailureReason = "paper_out";
    const { worker, calls, release } = workerWith([
      { kind: "not_printed", ticketId: "a", reason },
      { kind: "printed", ticketId: "a" },
    ]);

    const first = worker.kick();
    await release();
    await first;
    expect(calls.started).toBe(1);

    const second = worker.kick();
    await release();
    await release();
    await second;
    expect(calls.started).toBe(3);
  });

  it("reports a failure and still prints on the next kick", async () => {
    const { worker, calls, reported, release } = workerWith([new Error("the database is locked")]);

    const first = worker.kick();
    await release();
    await first;
    const second = worker.kick();
    await release();
    await second;

    expect(reported.map(({ context }) => context)).toEqual([
      "printing a contingency backup ticket",
    ]);
    expect(calls.started).toBe(2);
  });

  it("kicks itself on every interval once started, and keeps doing it", async () => {
    const { worker, timers, calls, release } = workerWith([]);

    worker.start();
    expect(timers.pending(INTERVAL_MS)).toBe(1);
    timers.fire(INTERVAL_MS);
    await release();
    expect(timers.pending(INTERVAL_MS)).toBe(1);
    timers.fire(INTERVAL_MS);
    await release();

    expect(calls.started).toBe(2);
  });
});
