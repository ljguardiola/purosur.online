import { describe, expect, it } from "vitest";
import { authorizingCompletedSales } from "./authorizing-completed-sales";

interface Charge {
  tendered: number;
}

type Outcome =
  | { kind: "completed"; sale_id: string; total: number }
  | { kind: "partially_paid"; sale_id: string; pending: number }
  | { kind: "unavailable" };

function wrapped(outcome: Outcome, authorizeSale: (saleId: string) => Promise<unknown>) {
  const charged: Charge[] = [];
  const failures: unknown[] = [];
  const charge = authorizingCompletedSales(
    { authorizeSale, onFailure: (error) => failures.push(error) },
    async (request: Charge) => {
      charged.push(request);
      return outcome;
    },
  );
  return { charge, charged, failures };
}

describe("authorizing the sales a charge completes", () => {
  it("hands the request to the charge and answers its outcome as it is", async () => {
    const outcome: Outcome = { kind: "completed", sale_id: "sale-1", total: 5900 };
    const { charge, charged } = wrapped(outcome, async () => undefined);

    await expect(charge({ tendered: 6000 })).resolves.toBe(outcome);
    expect(charged).toEqual([{ tendered: 6000 }]);
  });

  it("starts the authorization of the completed sale", async () => {
    const started: string[] = [];
    const { charge } = wrapped(
      { kind: "completed", sale_id: "sale-1", total: 5900 },
      async (saleId) => {
        started.push(saleId);
      },
    );

    await charge({ tendered: 6000 });

    expect(started).toEqual(["sale-1"]);
  });

  it("answers the cashier without waiting for the authorization", async () => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { charge } = wrapped(
      { kind: "completed", sale_id: "sale-1", total: 5900 },
      () => pending,
    );

    await expect(charge({ tendered: 6000 })).resolves.toMatchObject({ kind: "completed" });

    finish();
  });

  it.each([
    ["a partial payment", { kind: "partially_paid", sale_id: "sale-1", pending: 100 } as Outcome],
    ["a refused charge", { kind: "unavailable" } as Outcome],
  ])("authorizes nothing after %s", async (_case, outcome) => {
    const started: string[] = [];
    const { charge } = wrapped(outcome, async (saleId) => {
      started.push(saleId);
    });

    await charge({ tendered: 100 });

    expect(started).toEqual([]);
  });

  it("reports a failed authorization without touching the sale's outcome", async () => {
    const failure = new Error("the database is locked");
    const outcome: Outcome = { kind: "completed", sale_id: "sale-1", total: 5900 };
    const { charge, failures } = wrapped(outcome, async () => {
      throw failure;
    });

    await expect(charge({ tendered: 6000 })).resolves.toBe(outcome);
    await Promise.resolve();

    expect(failures).toEqual([failure]);
  });
});
