import { describe, expect, it } from "vitest";
import { DEFERRED_BACKLOG_RETRY_INTERVAL_MS } from "../model/deferred-backlog.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import { invoiceDeferredSalesUpTo } from "./invoice-deferred-sales-up-to.js";
import {
  AUTHORIZED,
  deferredCatchUpRig,
  FIRST,
  NOW,
  REJECTED,
  SECOND,
  sale,
  state,
  THIRD,
} from "./test-support/deferred-catch-up-rig.js";
import type { FakeDeferredSaleCatchUpState } from "./test-support/fake-deferred-sale-catch-up.js";

function invoiceUpTo(
  saleId: string,
  overrides: Partial<FakeDeferredSaleCatchUpState> = {},
  answers: readonly RealTimeAuthorizationAnswer[] = [AUTHORIZED],
) {
  const { register, taxAuthority, ports } = deferredCatchUpRig(overrides, answers);
  return { register, taxAuthority, outcome: invoiceDeferredSalesUpTo(ports, { saleId }) };
}

describe("invoicing the deferred sales up to one", () => {
  it("invoices the older sales and then the one asked for, and no newer one", async () => {
    const { register, outcome } = invoiceUpTo("sale-2");

    expect(await outcome).toEqual({ kind: "invoiced" });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-2"]);
  });

  it("invoices only the sale asked for when it is the oldest", async () => {
    const { register, outcome } = invoiceUpTo("sale-1");

    expect(await outcome).toEqual({ kind: "invoiced" });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("keeps the strict date order whatever order the backlog is held in", async () => {
    const { register, outcome } = invoiceUpTo("sale-3", { backlog: [THIRD, FIRST, SECOND] });

    expect(await outcome).toEqual({ kind: "invoiced" });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual([
      "sale-1",
      "sale-2",
      "sale-3",
    ]);
  });

  it("is not pending, invoicing nothing, when the sale is not in the backlog", async () => {
    const { register, taxAuthority, outcome } = invoiceUpTo("sale-9");

    expect(await outcome).toEqual({ kind: "not_pending" });
    expect(register.reservations).toEqual([]);
    expect(taxAuthority.calls).toEqual([]);
  });

  it("is not pending, invoicing nothing, when the sale's window ran out", async () => {
    const expired = sale("sale-0", "2026-09-20T14:00:00.000Z");
    const { register, outcome } = invoiceUpTo("sale-0", { backlog: [expired, FIRST] });

    expect(await outcome).toEqual({ kind: "not_pending" });
    expect(register.reservations).toEqual([]);
  });

  it("is not pending, invoicing nothing, when the sale is dated before the last authorized document", async () => {
    const { register, outcome } = invoiceUpTo("sale-1", {
      series: { ...state().series, taxAuthorityLastIssuedOn: "2026-10-02" },
    });

    expect(await outcome).toEqual({ kind: "not_pending" });
    expect(register.reservations).toEqual([]);
  });

  describe("is not yet possible, because the register cannot authorize, when", () => {
    it.each([
      ["it has no point of sale", { series: { ...state().series, pointOfSale: null } }],
      ["its numbering is frozen", { series: { ...state().series, numberingFrozen: true } }],
      [
        "it is not fiscally online",
        { online: { lastHealthCheckOkAt: null, tokenValid: true, arcaReachable: true } },
      ],
      ["a restored register still awaits its numbering", { awaitingRestoredNumbering: true }],
    ] satisfies [string, Partial<FakeDeferredSaleCatchUpState>][])(
      "%s",
      async (_case, overrides) => {
        const { register, taxAuthority, outcome } = invoiceUpTo("sale-2", overrides);

        expect(await outcome).toEqual({ kind: "not_yet", cause: "cannot_authorize" });
        expect(register.reservations).toEqual([]);
        expect(taxAuthority.calls).toEqual([]);
      },
    );

    it("the sale asked for is the one the tax authority does not authorize", async () => {
      const { register, outcome } = invoiceUpTo("sale-2", {}, [AUTHORIZED, REJECTED]);

      expect(await outcome).toEqual({ kind: "not_yet", cause: "cannot_authorize" });
      expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-2"]);
    });

    it("the sale asked for has to wait to be retried", async () => {
      const attemptEndedAt = new Date(NOW.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS + 1_000);
      const { register, outcome } = invoiceUpTo("sale-1", {
        backlog: [
          sale("sale-1", "2026-10-01T14:00:00.000Z", { lastAttemptEndedAt: attemptEndedAt }),
          SECOND,
        ],
      });

      expect(await outcome).toEqual({ kind: "not_yet", cause: "cannot_authorize" });
      expect(register.reservations).toEqual([]);
    });

    it("the pre-emission gate refuses the sale asked for", async () => {
      const { register, outcome } = invoiceUpTo("sale-1", { issuer: undefined });

      expect(await outcome).toEqual({ kind: "not_yet", cause: "cannot_authorize" });
      expect(register.reservations).toEqual([]);
    });
  });

  describe("is not yet possible, because an older sale is blocking the backlog, when", () => {
    it("the tax authority rejects an older sale", async () => {
      const { register, outcome } = invoiceUpTo("sale-3", {}, [REJECTED]);

      expect(await outcome).toEqual({ kind: "not_yet", cause: "older_sale_blocking" });
      expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
    });

    it("the outcome of an older sale is unclear", async () => {
      const { outcome } = invoiceUpTo("sale-2", {}, [{ kind: "unclear" }]);

      expect(await outcome).toEqual({ kind: "not_yet", cause: "older_sale_blocking" });
    });

    it("an older sale has to wait to be retried", async () => {
      const attemptEndedAt = new Date(NOW.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS + 1_000);
      const { register, outcome } = invoiceUpTo("sale-2", {
        backlog: [
          sale("sale-1", "2026-10-01T14:00:00.000Z", { lastAttemptEndedAt: attemptEndedAt }),
          SECOND,
        ],
      });

      expect(await outcome).toEqual({ kind: "not_yet", cause: "older_sale_blocking" });
      expect(register.reservations).toEqual([]);
    });

    it("the pre-emission gate refuses an older sale", async () => {
      const { register, outcome } = invoiceUpTo("sale-2", { issuer: undefined });

      expect(await outcome).toEqual({ kind: "not_yet", cause: "older_sale_blocking" });
      expect(register.reservations).toEqual([]);
    });
  });
});
