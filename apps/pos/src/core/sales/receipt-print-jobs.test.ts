import { RECEIPT_RETRY_DELAY_MS } from "@purosur/domain";
import type { ReceiptPrinter } from "@purosur/domain/sales/use-cases";
import { describe, expect, it, vi } from "vitest";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";

const START = new Date("2026-10-08T12:00:00.000Z");
const BYTES = Uint8Array.of(1, 2, 3);

function rig() {
  let moment = START;
  const failures: unknown[] = [];
  const printer = new ControllableReceiptPrinter();
  const jobs = createReceiptPrintJobs({
    now: () => moment,
    reportFailure: (_context, error) => failures.push(error),
  });
  return {
    jobs,
    printer,
    failures,
    advance(ms: number) {
      moment = new Date(moment.getTime() + ms);
    },
  };
}

type Rig = ReturnType<typeof rig>;

function sending(printer: ReceiptPrinter) {
  return async ({
    watch,
    printer: wrap,
  }: {
    watch: Parameters<ReceiptPrinter["print"]>[1];
    printer: (inner: ReceiptPrinter) => ReceiptPrinter;
  }) => {
    const ending = await wrap(printer).print(BYTES, watch);
    return { kind: ending.kind };
  };
}

function printingSale({ jobs, printer }: Rig, saleId = "sale-1") {
  return jobs.start(saleId, sending(printer));
}

describe("receipt print jobs", () => {
  it("knows no standing for a sale nothing was printed for", () => {
    expect(rig().jobs.standing("sale-1")).toBeNull();
  });

  it("answers sent as soon as the printer received the receipt, without waiting for its acknowledgment", async () => {
    const subject = rig();

    const started = await printingSale(subject);

    expect(started).toEqual({ kind: "sent" });
    expect(subject.printer.sent).toHaveLength(1);
    expect(subject.jobs.standing("sale-1")).toBe("printing");
  });

  it("stands as printed once the printer acknowledges", async () => {
    const subject = rig();
    await printingSale(subject);

    subject.printer.acknowledge();

    await vi.waitFor(() => expect(subject.jobs.standing("sale-1")).toBe("printed"));
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "stands as %s while the printer reports it",
    async (status) => {
      const subject = rig();
      await printingSale(subject);

      subject.printer.report(status);

      expect(subject.jobs.standing("sale-1")).toBe(status);
    },
  );

  it("offers a retry once the printer has been ready for the retry delay without acknowledging", async () => {
    const subject = rig();
    await printingSale(subject);
    subject.printer.report("ready");

    subject.advance(RECEIPT_RETRY_DELAY_MS - 1);
    expect(subject.jobs.standing("sale-1")).toBe("printing");
    subject.advance(1);

    expect(subject.jobs.standing("sale-1")).toBe("retry_offered");
  });

  it.each(["printing", "cover_open"] as const)(
    "refuses to start another print of a sale while it stands as %s",
    async (status) => {
      const subject = rig();
      await printingSale(subject);
      if (status !== "printing") subject.printer.report(status);

      const second = await printingSale(subject);

      expect(second).toEqual({ kind: "busy" });
      expect(subject.printer.sent).toHaveLength(1);
    },
  );

  it("refuses to start another print of a sale while a previous start has not sent yet", async () => {
    const subject = rig();
    let release: () => void = () => {};
    const slow = subject.jobs.start("sale-1", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { kind: "not_found" };
    });

    expect(await printingSale(subject)).toEqual({ kind: "busy" });
    release();
    await slow;
  });

  it("starts a print of another sale while one is in progress", async () => {
    const subject = rig();
    await printingSale(subject, "sale-1");

    expect(await printingSale(subject, "sale-2")).toEqual({ kind: "sent" });
  });

  it("starts another print once the previous one is printed", async () => {
    const subject = rig();
    await printingSale(subject);
    subject.printer.acknowledge();
    await vi.waitFor(() => expect(subject.jobs.standing("sale-1")).toBe("printed"));

    expect(await printingSale(subject)).toEqual({ kind: "sent" });
    expect(subject.jobs.standing("sale-1")).toBe("printing");
  });

  it("abandons the previous print when it starts the print that replaces a retry offered", async () => {
    const subject = rig();
    await printingSale(subject);
    subject.printer.report("ready");
    subject.advance(RECEIPT_RETRY_DELAY_MS);

    const second = await printingSale(subject);

    expect(second).toEqual({ kind: "sent" });
    expect(subject.printer.sent[0]?.watch.signal.aborted).toBe(true);
    expect(subject.printer.sent[1]?.watch.signal.aborted).toBe(false);
    expect(subject.jobs.standing("sale-1")).toBe("printing");
  });

  it("ignores what the abandoned print still reports", async () => {
    const subject = rig();
    await printingSale(subject);
    subject.printer.report("ready");
    subject.advance(RECEIPT_RETRY_DELAY_MS);
    await printingSale(subject);

    subject.printer.report("paper_out", 0);

    expect(subject.jobs.standing("sale-1")).toBe("printing");
  });

  it("keeps the print it offered a retry for when the new start is answered before sending", async () => {
    const subject = rig();
    await printingSale(subject);
    subject.printer.report("ready");
    subject.advance(RECEIPT_RETRY_DELAY_MS);

    const refused = await subject.jobs.start("sale-1", async () => ({ kind: "not_permitted" }));

    expect(refused).toEqual({ kind: "answered", outcome: { kind: "not_permitted" } });
    expect(subject.printer.sent[0]?.watch.signal.aborted).toBe(false);
    expect(subject.jobs.standing("sale-1")).toBe("retry_offered");
  });

  it("answers with the outcome of a start that ended without sending, leaving no job", async () => {
    const subject = rig();

    const started = await subject.jobs.start("sale-1", async () => ({ kind: "unavailable" }));

    expect(started).toEqual({ kind: "answered", outcome: { kind: "unavailable" } });
    expect(subject.jobs.standing("sale-1")).toBeNull();
    expect(await printingSale(subject)).toEqual({ kind: "sent" });
  });

  it("reports a failure before sending and leaves the sale free to print", async () => {
    const subject = rig();
    const failure = new Error("the ledger is damaged");

    const started = await subject.jobs.start("sale-1", async () => {
      throw failure;
    });

    expect(started).toEqual({ kind: "failed" });
    expect(subject.failures).toEqual([failure]);
    expect(await printingSale(subject)).toEqual({ kind: "sent" });
  });

  it("reports a failure after sending and leaves the sale free to print again", async () => {
    const subject = rig();
    const failure = new Error("the printer adapter broke");
    const breaking: ReceiptPrinter = {
      print: async () => {
        throw failure;
      },
    };
    const started = await subject.jobs.start("sale-1", async ({ watch, printer }) =>
      printer(breaking).print(BYTES, watch),
    );

    expect(started).toEqual({ kind: "sent" });
    await vi.waitFor(() => expect(subject.failures).toEqual([failure]));
    expect(subject.jobs.standing("sale-1")).toBeNull();
  });
});
