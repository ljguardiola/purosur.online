import type { ContingencyBackupOperation, FiscalEmissionMode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { createTicketedOperations } from "./ticketed-operation";
import {
  type TicketableRendererRequests,
  ticketedRendererRequests,
} from "./ticketed-renderer-requests";

const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };
const AUTHORIZATION = { user_id: "supervisor", pin: "1234" };

function setup(overrides: Partial<TicketableRendererRequests> = {}) {
  const recorded: { operation: ContingencyBackupOperation; subjectId: string | null }[] = [];
  let lastDeviceSeq = 0;
  const { ticketed } = createTicketedOperations({
    readLastDeviceSeq: () => {
      lastDeviceSeq += 1;
      return lastDeviceSeq;
    },
    readEmissionMode: () => OFFLINE,
    record: async ({ operation, subjectId }) => {
      recorded.push({ operation, subjectId });
    },
    afterRecorded: () => {},
    reportFailure: () => {},
  });
  const requests: TicketableRendererRequests = {
    chargeSaleInCash: async () => ({
      kind: "completed",
      sale_id: "sale-in-cash",
      total: 100,
      tendered: 100,
      change: 0,
    }),
    chargeSaleByTransfer: async () => ({
      kind: "completed",
      sale_id: "sale-by-transfer",
      total: 1,
    }),
    chargeSaleOnStandaloneTerminal: async () => ({
      kind: "completed",
      sale_id: "sale-on-terminal",
      total: 1,
    }),
    followMercadoPagoCharge: async () => ({ kind: "waiting", remaining_seconds: 30 }),
    abandonMercadoPagoCharge: async () => ({ kind: "replaced" }),
    cancelPaidSale: async () => ({ kind: "not_signed_in" }),
    voidSale: async () => ({ kind: "not_signed_in" }),
    completeReturn: async () => ({
      kind: "completed",
      return_id: "return-1",
      refunded_total: 100,
      refunds: [],
      authorized_by: null,
    }),
    recordCashMovement: async () => ({ kind: "invalid_amount" }),
    openCashSession: async () => ({ kind: "not_signed_in" }),
    closeCashSession: async () => ({ kind: "not_signed_in" }),
    closeLockedCashSession: async () => ({ kind: "not_locked" }),
    initialCount: {
      read: async () => ({ kind: "not_signed_in" }),
      record: async () => ({ kind: "unknown_product" }),
      withdraw: async () => ({ kind: "withdrawn" }),
      find: async () => ({ kind: "not_signed_in" }),
      search: async () => ({ kind: "not_signed_in" }),
      weigh: async () => ({ kind: "not_signed_in" }),
    },
    clockGuard: {
      read: async () => ({ kind: "unavailable" }),
      correct: async () => ({ kind: "not_signed_in" }),
    },
    ...overrides,
  };
  const ticketedRequests = ticketedRendererRequests(requests, {
    ticketed,
    saleOfCharge: (paymentTransactionId) => `sale-of-${paymentTransactionId}`,
  });
  return { requests, ticketedRequests, recorded };
}

describe("the renderer requests that leave a contingency backup ticket", () => {
  it("tickets each charge as a sale of the sale it completed", async () => {
    const { ticketedRequests, recorded } = setup();

    await ticketedRequests.chargeSaleInCash?.({ saleId: "sale-1", tendered: 100 });
    await ticketedRequests.chargeSaleByTransfer?.({ saleId: "sale-1", amount: 1 });
    await ticketedRequests.chargeSaleOnStandaloneTerminal?.({ saleId: "sale-1", amount: 1 });

    expect(recorded).toEqual([
      { operation: "sale", subjectId: "sale-in-cash" },
      { operation: "sale", subjectId: "sale-by-transfer" },
      { operation: "sale", subjectId: "sale-on-terminal" },
    ]);
  });

  it.each([["followMercadoPagoCharge"], ["abandonMercadoPagoCharge"]] as const)(
    "tickets %s as a sale of the sale its charge belongs to",
    async (request) => {
      const { ticketedRequests, recorded } = setup();

      await ticketedRequests[request]?.({ paymentTransactionId: "qr-1" });

      expect(recorded).toEqual([{ operation: "sale", subjectId: "sale-of-qr-1" }]);
    },
  );

  it("tickets cancelling a paid sale and voiding a sale with the sale they name", async () => {
    const { ticketedRequests, recorded } = setup();

    await ticketedRequests.cancelPaidSale?.({ saleId: "sale-1", authorization: undefined });
    await ticketedRequests.voidSale?.({
      saleId: "sale-2",
      pendingRefundsConfirmed: false,
      authorization: undefined,
    });

    expect(recorded).toEqual([
      { operation: "paid_sale_cancellation", subjectId: "sale-1" },
      { operation: "sale_void", subjectId: "sale-2" },
    ]);
  });

  it("tickets a completed return with the return it recorded", async () => {
    const { ticketedRequests, recorded } = setup();

    await ticketedRequests.completeReturn?.({
      saleId: "sale-1",
      ticketSource: "QR",
      lines: [],
      refunds: [],
    });

    expect(recorded).toEqual([{ operation: "return", subjectId: "return-1" }]);
  });

  it("tickets a return that was not completed with no subject", async () => {
    const { ticketedRequests, recorded } = setup({
      completeReturn: async () => ({ kind: "not_signed_in" }),
    });

    await ticketedRequests.completeReturn?.({
      saleId: "sale-1",
      ticketSource: "QR",
      lines: [],
      refunds: [],
    });

    expect(recorded).toEqual([{ operation: "return", subjectId: null }]);
  });

  it("tickets the cash session, the cash movements, the initial count and the clock with no subject", async () => {
    const { ticketedRequests, recorded } = setup();

    await ticketedRequests.recordCashMovement?.({ kind: "WITHDRAWAL", amount: 100, reason: "" });
    await ticketedRequests.openCashSession?.(100);
    await ticketedRequests.closeCashSession?.("session-1", 100);
    await ticketedRequests.closeLockedCashSession?.("session-1", 100, AUTHORIZATION);
    await ticketedRequests.initialCount?.record({
      productId: "p1",
      counted: 1,
      expiresOn: null,
    });
    await ticketedRequests.initialCount?.withdraw("movement-1");
    await ticketedRequests.clockGuard?.correct();

    expect(recorded).toEqual([
      { operation: "cash_movement", subjectId: null },
      { operation: "cash_session_opening", subjectId: null },
      { operation: "cash_session_closing", subjectId: null },
      { operation: "cash_session_closing", subjectId: null },
      { operation: "initial_count", subjectId: null },
      { operation: "initial_count", subjectId: null },
      { operation: "clock_correction", subjectId: null },
    ]);
  });

  it("leaves the reads of the initial count and the clock as they are", () => {
    const { requests, ticketedRequests } = setup();

    expect(ticketedRequests.initialCount?.read).toBe(requests.initialCount?.read);
    expect(ticketedRequests.initialCount?.find).toBe(requests.initialCount?.find);
    expect(ticketedRequests.clockGuard?.read).toBe(requests.clockGuard?.read);
  });
});
