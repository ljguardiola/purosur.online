import type { StartupPending } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { startupPendingGate } from "./startup-pending-gate";

const NOTHING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
};
const A_SALE_TO_PRINT: StartupPending = {
  ...NOTHING,
  sales_to_print: [
    {
      sale_id: "sale-1",
      completed_at: "2026-09-30T10:15:00.000-03:00",
      total: 123_450,
      standing: "never_printed",
    },
  ],
};
const A_FISCAL_DOCUMENT: StartupPending = {
  ...NOTHING,
  unknown_fiscal_documents: [
    {
      id: "doc-1",
      sale_id: "sale-2",
      completed_at: "2026-09-30T10:20:00.000-03:00",
      total: 50_000,
    },
  ],
};
const A_PAYMENT: StartupPending = {
  ...NOTHING,
  pending_payments: [
    {
      payment_id: "pay-1",
      sale_id: "sale-3",
      method: "QR",
      amount: 80_000,
      occurred_at: "2026-09-30T10:25:00.000-03:00",
    },
  ],
};

describe("startupPendingGate", () => {
  it.each([
    ["a sale to print", A_SALE_TO_PRINT],
    ["an unknown fiscal document", A_FISCAL_DOCUMENT],
    ["a pending payment", A_PAYMENT],
  ])("lands on the pending screen when the core lists %s", async (_name, pending) => {
    const gate = startupPendingGate();

    expect(await gate.lands(async () => pending)).toBe(true);
    expect(gate.dismissed()).toBe(false);
  });

  it("keeps landing on the pending screen until it is dismissed", async () => {
    const gate = startupPendingGate();
    await gate.lands(async () => A_SALE_TO_PRINT);

    expect(await gate.lands(async () => A_SALE_TO_PRINT)).toBe(true);
  });

  it("goes on to selling and never asks again once the core lists nothing", async () => {
    const gate = startupPendingGate();
    const read = vi.fn(async () => NOTHING);

    expect(await gate.lands(read)).toBe(false);
    expect(await gate.lands(async () => A_SALE_TO_PRINT)).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    expect(gate.dismissed()).toBe(true);
  });

  it("goes on to selling when the person may not see what is pending", async () => {
    const gate = startupPendingGate();

    expect(await gate.lands(async () => "not_permitted")).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("goes on to selling when the read fails", async () => {
    const gate = startupPendingGate();

    expect(
      await gate.lands(async () => {
        throw new Error("the core could not answer");
      }),
    ).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("stops landing on the pending screen once dismissed", async () => {
    const gate = startupPendingGate();
    const read = vi.fn(async () => A_SALE_TO_PRINT);

    gate.dismiss();

    expect(await gate.lands(read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
