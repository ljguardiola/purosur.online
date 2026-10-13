import { describe, expect, it, vi } from "vitest";
import { printingCompletedSales, printingEachCompletedSale } from "./printing-completed-sales";

const COMPLETED = { kind: "completed", sale_id: "sale-1", total: 3000 } as const;

function rig(options: { printing?: Promise<void>; beforePrinting?: Promise<void> } = {}) {
  const events: string[] = [];
  const failures: unknown[] = [];
  const charge = async (request: { saleId: string }) => {
    events.push(`charge ${request.saleId}`);
    return request.saleId === "partial"
      ? ({ kind: "partially_paid", sale_id: "partial" } as const)
      : COMPLETED;
  };
  const deps = {
    beforePrinting: async (saleId: string) => {
      events.push(`before printing ${saleId}`);
      await options.beforePrinting;
    },
    print: async (saleId: string) => {
      events.push(`print ${saleId}`);
      await options.printing;
    },
    syncNow: () => {
      events.push("sync");
    },
    onFailure: (error: unknown) => failures.push(error),
  };
  return { events, failures, charge, deps };
}

describe("printing the receipt of a sale just completed", () => {
  it("answers the charge unchanged without waiting for the print", async () => {
    const subject = rig({ printing: new Promise(() => {}) });

    const outcome = await printingCompletedSales(
      subject.deps,
      subject.charge,
    )({ saleId: "sale-1" });

    expect(outcome).toEqual(COMPLETED);
    await vi.waitFor(() =>
      expect(subject.events).toEqual(["charge sale-1", "before printing sale-1", "print sale-1"]),
    );
  });

  it("syncs once the print was started", async () => {
    const subject = rig();

    await printingCompletedSales(subject.deps, subject.charge)({ saleId: "sale-1" });
    await vi.waitFor(() => expect(subject.events).toContain("sync"));

    expect(subject.events).toEqual([
      "charge sale-1",
      "before printing sale-1",
      "print sale-1",
      "sync",
    ]);
  });

  it("does not print nor sync a charge that did not complete the sale", async () => {
    const subject = rig();

    const outcome = await printingCompletedSales(
      subject.deps,
      subject.charge,
    )({ saleId: "partial" });

    expect(outcome).toMatchObject({ kind: "partially_paid" });
    expect(subject.events).toEqual(["charge partial"]);
  });

  it("reports a print that failed and still syncs", async () => {
    const failure = new Error("the printer adapter broke");
    const subject = rig();
    const failing = {
      ...subject.deps,
      print: async () => {
        throw failure;
      },
    };

    await printingCompletedSales(failing, subject.charge)({ saleId: "sale-1" });
    await vi.waitFor(() => expect(subject.events).toContain("sync"));

    expect(subject.failures).toEqual([failure]);
    expect(subject.events).toEqual(["charge sale-1", "before printing sale-1", "sync"]);
  });

  it("answers the charge without waiting for what comes before printing", async () => {
    const subject = rig({ beforePrinting: new Promise(() => {}) });

    const outcome = await printingCompletedSales(
      subject.deps,
      subject.charge,
    )({ saleId: "sale-1" });

    expect(outcome).toEqual(COMPLETED);
  });

  it("prints only once what comes before printing has settled", async () => {
    let settle: () => void = () => {};
    const subject = rig({
      beforePrinting: new Promise<void>((resolve) => {
        settle = resolve;
      }),
    });

    await printingCompletedSales(subject.deps, subject.charge)({ saleId: "sale-1" });
    await Promise.resolve();
    expect(subject.events).toEqual(["charge sale-1", "before printing sale-1"]);

    settle();
    await vi.waitFor(() => expect(subject.events).toContain("print sale-1"));
  });

  it("reports a failure of what comes before printing and still prints", async () => {
    const failure = new Error("the authorization broke");
    const subject = rig();
    const failing = {
      ...subject.deps,
      beforePrinting: async () => {
        throw failure;
      },
    };

    await printingCompletedSales(failing, subject.charge)({ saleId: "sale-1" });
    await vi.waitFor(() => expect(subject.events).toContain("sync"));

    expect(subject.failures).toEqual([failure]);
    expect(subject.events).toEqual(["charge sale-1", "print sale-1", "sync"]);
  });
});

describe("printing the receipt of each sale a follow of several charges completed", () => {
  function follow(events: string[]) {
    return async (runStartedAt: string) => {
      events.push(`follow ${runStartedAt}`);
      return {
        followed: [
          { paymentTransactionId: "qr-1", outcome: COMPLETED },
          { paymentTransactionId: "qr-2", outcome: { kind: "waiting", remaining_seconds: 60 } },
          {
            paymentTransactionId: "qr-3",
            outcome: { kind: "completed", sale_id: "sale-3", total: 1000 },
          },
        ],
        failures: [],
      };
    };
  }

  it("answers the follow unchanged and prints each completed sale once what comes before printing settled, syncing after each", async () => {
    const subject = rig();

    const outcome = await printingEachCompletedSale(subject.deps, follow(subject.events))("run");

    expect(outcome.followed.map(({ paymentTransactionId }) => paymentTransactionId)).toEqual([
      "qr-1",
      "qr-2",
      "qr-3",
    ]);
    await vi.waitFor(() =>
      expect(subject.events.filter((event) => event === "sync")).toHaveLength(2),
    );
    expect(subject.events.filter((event) => event !== "sync")).toEqual([
      "follow run",
      "before printing sale-1",
      "before printing sale-3",
      "print sale-1",
      "print sale-3",
    ]);
  });

  it("prints and syncs nothing when no charge completed a sale", async () => {
    const subject = rig();

    await printingEachCompletedSale(subject.deps, async () => ({
      followed: [{ paymentTransactionId: "qr-2", outcome: { kind: "declined" } }],
      failures: [],
    }))(undefined);

    expect(subject.events).toEqual([]);
  });
});
