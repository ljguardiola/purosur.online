import { paidSaleCancellationLeavesBackupTicket } from "@purosur/domain";
import { completedSaleId } from "../platform/completed-sale-id";
import type { RendererRequestDeps } from "../renderer-requests";
import type { TicketedOperations } from "./ticketed-operation";

export type TicketableRendererRequests = Pick<
  RendererRequestDeps,
  | "chargeSaleInCash"
  | "chargeSaleByTransfer"
  | "chargeSaleOnStandaloneTerminal"
  | "chargeSaleWithPaidOrder"
  | "followMercadoPagoCharge"
  | "abandonMercadoPagoCharge"
  | "cancelPaidSale"
  | "voidSale"
  | "completeReturn"
  | "recordCashMovement"
  | "openCashSession"
  | "closeCashSession"
  | "closeLockedCashSession"
  | "initialCount"
  | "clockGuard"
>;

export interface TicketedRendererRequestsDeps {
  ticketed: TicketedOperations["ticketed"];
  saleOfCharge: (paymentTransactionId: string) => string | null;
}

export function ticketedRendererRequests<TRequests extends TicketableRendererRequests>(
  requests: TRequests,
  { ticketed, saleOfCharge }: TicketedRendererRequestsDeps,
): TRequests {
  const completedSale = (_args: unknown, outcome: { kind: string }) =>
    completedSaleId(outcome) ?? null;
  const saleOfRequest = ([request]: [{ saleId: string }, ...unknown[]]) => request.saleId;
  const saleOfChargeRequest = ([request]: [{ paymentTransactionId: string }]) =>
    saleOfCharge(request.paymentTransactionId);
  return {
    ...requests,
    chargeSaleInCash: ticketed("sale", requests.chargeSaleInCash, completedSale),
    chargeSaleByTransfer: ticketed("sale", requests.chargeSaleByTransfer, completedSale),
    chargeSaleOnStandaloneTerminal: ticketed(
      "sale",
      requests.chargeSaleOnStandaloneTerminal,
      completedSale,
    ),
    chargeSaleWithPaidOrder: ticketed("sale", requests.chargeSaleWithPaidOrder, completedSale),
    followMercadoPagoCharge: ticketed(
      "sale",
      requests.followMercadoPagoCharge,
      saleOfChargeRequest,
    ),
    abandonMercadoPagoCharge: ticketed(
      "sale",
      requests.abandonMercadoPagoCharge,
      saleOfChargeRequest,
    ),
    cancelPaidSale: ticketed(
      "paid_sale_cancellation",
      requests.cancelPaidSale,
      saleOfRequest,
      (_args, outcome) =>
        outcome.kind !== "cancelled" || paidSaleCancellationLeavesBackupTicket(outcome.refunds),
    ),
    voidSale: ticketed("sale_void", requests.voidSale, saleOfRequest),
    completeReturn: ticketed("return", requests.completeReturn, (_args, outcome) =>
      outcome.kind === "completed" ? outcome.return_id : null,
    ),
    recordCashMovement: ticketed("cash_movement", requests.recordCashMovement),
    openCashSession: ticketed("cash_session_opening", requests.openCashSession),
    closeCashSession: ticketed("cash_session_closing", requests.closeCashSession),
    closeLockedCashSession: ticketed("cash_session_closing", requests.closeLockedCashSession),
    initialCount: requests.initialCount && {
      ...requests.initialCount,
      record: ticketed("initial_count", requests.initialCount.record),
      withdraw: ticketed("initial_count", requests.initialCount.withdraw),
    },
    clockGuard: requests.clockGuard && {
      ...requests.clockGuard,
      correct: ticketed("clock_correction", requests.clockGuard.correct),
    },
  };
}
