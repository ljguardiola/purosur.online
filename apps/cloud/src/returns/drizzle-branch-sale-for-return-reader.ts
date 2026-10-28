import {
  type DeferredSaleState,
  EXPIRED_DEFERRED_SALE_STATE,
  FACTURA_C_DOCUMENT_TYPE,
  isCreditNoteRoutingInvoice,
  isUnbilledDeferredSale,
  OPEN_FISCAL_TASK_STATE,
  PAYMENT_METHODS,
  PENDING_DEFERRED_SALE_STATE,
  REFUND_DISCARDED_STATE,
  recordedRequestDocumentState,
  SALE_STATES_AFTER_COMPLETION,
  SALE_UNITS,
  type SaleInvoice,
  type SaleState,
  type TicketReference,
} from "@purosur/domain";
import type { BranchSaleFacts, BranchSaleForReturnReader } from "@purosur/domain/returns/use-cases";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { answerOf, decisionOf } from "../fiscal/fiscal-request-answer.js";
import { heldByTaxAuthority } from "../fiscal/held-by-tax-authority.js";
import {
  deferredSales,
  fiscalRequests,
  fiscalTasks,
  offlineFiscalDocuments,
  paymentRefunds,
  products,
  registers,
  returnLines,
  saleLines,
  salePayments,
  saleReturns,
  sales,
} from "../platform/db/schema.js";

function saleStateOf(state: string): SaleState {
  if (state === "COMPLETED" || state === "VOIDED") {
    return state;
  }
  throw new Error(`sale state ${state} is not one a completed sale can have`);
}

export class DrizzleBranchSaleForReturnReader<TQueryResult extends PgQueryResultHKT>
  implements BranchSaleForReturnReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async saleForReturnInBranchOf(
    registerId: string,
    ticket: TicketReference,
  ): Promise<BranchSaleFacts | undefined> {
    const saleId = await this.saleIdOf(registerId, ticket);
    if (saleId === undefined) {
      return undefined;
    }
    const [sale] = await this.db
      .select({
        id: sales.id,
        registerId: sales.registerId,
        deviceId: sales.deviceId,
        sessionId: sales.sessionId,
        actorId: sales.actorId,
        state: sales.state,
        completedAt: sales.completedAt,
      })
      .from(sales)
      .innerJoin(registers, this.askingRegisterBranch(registerId))
      .where(and(eq(sales.id, saleId), inArray(sales.state, [...SALE_STATES_AFTER_COMPLETION])));
    if (sale?.completedAt == null) {
      return undefined;
    }
    return {
      sale: {
        sale: {
          id: sale.id,
          registerId: sale.registerId,
          deviceId: sale.deviceId,
          sessionId: sale.sessionId,
          actorId: sale.actorId,
          state: saleStateOf(sale.state),
          lines: await this.linesOf(sale.id),
        },
        occurredAt: sale.completedAt,
        invoice: await this.invoiceOf(sale.id),
        payments: await this.paymentsOf(sale.id),
        returned: await this.returnedFromLinesOf(sale.id),
      },
      invoiceStanding: await this.invoiceStandingOf(sale.id),
      countedReturnIds: await this.countedReturnIdsOf(sale.id),
    };
  }

  private askingRegisterBranch(registerId: string) {
    return and(eq(registers.id, registerId), eq(registers.locationId, sales.locationId));
  }

  private async saleIdOf(registerId: string, ticket: TicketReference): Promise<string | undefined> {
    if (ticket.kind === "deferred") {
      const [deferred] = await this.db
        .select({ saleId: deferredSales.saleId })
        .from(deferredSales)
        .innerJoin(sales, eq(sales.id, deferredSales.saleId))
        .innerJoin(registers, this.askingRegisterBranch(registerId))
        .where(and(eq(deferredSales.id, ticket.id), eq(deferredSales.shortCode, ticket.shortCode)));
      return deferred?.saleId;
    }
    const [authorized] = await this.db
      .select({ saleId: fiscalRequests.saleId })
      .from(fiscalRequests)
      .innerJoin(sales, eq(sales.id, fiscalRequests.saleId))
      .innerJoin(registers, this.askingRegisterBranch(registerId))
      .where(
        and(
          eq(fiscalRequests.pointOfSale, ticket.pointOfSale),
          eq(fiscalRequests.number, ticket.number),
          heldByTaxAuthority,
        ),
      );
    if (authorized !== undefined) {
      return authorized.saleId;
    }
    const [offline] = await this.db
      .select({ saleId: offlineFiscalDocuments.saleId })
      .from(offlineFiscalDocuments)
      .innerJoin(sales, eq(sales.id, offlineFiscalDocuments.saleId))
      .innerJoin(registers, this.askingRegisterBranch(registerId))
      .where(
        and(
          eq(offlineFiscalDocuments.pointOfSale, ticket.pointOfSale),
          eq(offlineFiscalDocuments.number, ticket.number),
          eq(offlineFiscalDocuments.documentType, FACTURA_C_DOCUMENT_TYPE),
        ),
      );
    return offline?.saleId;
  }

  private async invoiceStandingOf(saleId: string): Promise<BranchSaleFacts["invoiceStanding"]> {
    const requests = await this.db
      .select({
        pointOfSale: fiscalRequests.pointOfSale,
        number: fiscalRequests.number,
        buyerTaxStatusCode: fiscalRequests.buyerTaxStatusCode,
        answerKind: fiscalRequests.answerKind,
        authorizationCode: fiscalRequests.authorizationCode,
        authorizationCodeDueOn: fiscalRequests.authorizationCodeDueOn,
        rejectionCodes: fiscalRequests.rejectionCodes,
        rejectionClass: fiscalRequests.rejectionClass,
        decision: fiscalRequests.decision,
        adoptedAuthorizationCode: fiscalRequests.adoptedAuthorizationCode,
        adoptedAuthorizationCodeDueOn: fiscalRequests.adoptedAuthorizationCodeDueOn,
      })
      .from(fiscalRequests)
      .where(eq(fiscalRequests.saleId, saleId));
    const offline = await this.db
      .select({
        pointOfSale: offlineFiscalDocuments.pointOfSale,
        number: offlineFiscalDocuments.number,
        buyerTaxStatusCode: offlineFiscalDocuments.buyerTaxStatusCode,
      })
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.saleId, saleId),
          eq(offlineFiscalDocuments.documentType, FACTURA_C_DOCUMENT_TYPE),
        ),
      );
    const deferrals = await this.db
      .select({ state: deferredSales.state, openTaskId: fiscalTasks.id })
      .from(deferredSales)
      .leftJoin(
        fiscalTasks,
        and(
          eq(fiscalTasks.deferredSaleId, deferredSales.id),
          eq(fiscalTasks.state, OPEN_FISCAL_TASK_STATE),
        ),
      )
      .where(
        and(
          eq(deferredSales.saleId, saleId),
          inArray(deferredSales.state, [PENDING_DEFERRED_SALE_STATE, EXPIRED_DEFERRED_SALE_STATE]),
        ),
      );
    const realTime = requests.map(
      (request): SaleInvoice => ({
        origin: "real_time",
        state: recordedRequestDocumentState({
          answer: answerOf(request),
          decision: decisionOf(request),
        }),
        pointOfSale: request.pointOfSale,
        number: request.number,
        buyerTaxStatusCode: request.buyerTaxStatusCode,
      }),
    );
    return {
      fiscalDocuments: [
        ...realTime,
        ...offline.map(
          (invoice): SaleInvoice => ({ origin: "offline", state: "AUTHORIZED", ...invoice }),
        ),
      ].filter(isCreditNoteRoutingInvoice),
      deferralPending: deferrals.some(({ state, openTaskId }) =>
        isUnbilledDeferredSale({
          state: state as DeferredSaleState,
          regularizationTaskOpen: openTaskId !== null,
        }),
      ),
    };
  }

  private async invoiceOf(saleId: string): Promise<{ pointOfSale: number; number: number } | null> {
    const [authorized] = await this.db
      .select({ pointOfSale: fiscalRequests.pointOfSale, number: fiscalRequests.number })
      .from(fiscalRequests)
      .where(and(eq(fiscalRequests.saleId, saleId), heldByTaxAuthority));
    if (authorized !== undefined) {
      return authorized;
    }
    const [offline] = await this.db
      .select({
        pointOfSale: offlineFiscalDocuments.pointOfSale,
        number: offlineFiscalDocuments.number,
      })
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.saleId, saleId),
          eq(offlineFiscalDocuments.documentType, FACTURA_C_DOCUMENT_TYPE),
        ),
      );
    return offline ?? null;
  }

  private async linesOf(saleId: string): Promise<BranchSaleFacts["sale"]["sale"]["lines"]> {
    const rows = await this.db
      .select({
        id: saleLines.id,
        productId: saleLines.productId,
        productName: saleLines.productName,
        saleUnit: products.saleUnit,
        quantity: saleLines.quantity,
        promotionId: saleLines.promotionId,
        lineTotal: saleLines.lineTotal,
      })
      .from(saleLines)
      .leftJoin(products, eq(products.id, saleLines.productId))
      .where(eq(saleLines.saleId, saleId));
    return rows.map(({ saleUnit: stored, ...line }) => {
      const saleUnit = SALE_UNITS.find((known) => known === stored);
      if (saleUnit === undefined) {
        throw new Error(`product ${line.productId} of sale ${saleId} has no known sale unit`);
      }
      return { ...line, saleUnit };
    });
  }

  private async paymentsOf(saleId: string): Promise<BranchSaleFacts["sale"]["payments"]> {
    const rows = await this.db
      .select({
        id: salePayments.id,
        method: salePayments.method,
        provider: salePayments.provider,
        amount: salePayments.amount,
        state: salePayments.state,
        cardType: salePayments.cardType,
        refundedAmount: sql<number>`coalesce(sum(${paymentRefunds.amount}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(salePayments)
      .leftJoin(
        paymentRefunds,
        and(
          eq(paymentRefunds.paymentId, salePayments.id),
          ne(paymentRefunds.state, REFUND_DISCARDED_STATE),
        ),
      )
      .where(eq(salePayments.saleId, saleId))
      .groupBy(salePayments.id);
    return rows.map(({ method: stored, ...payment }) => {
      const method = PAYMENT_METHODS.find((known) => known === stored);
      if (method === undefined) {
        throw new Error(`payment ${payment.id} has the unknown method ${stored}`);
      }
      return { ...payment, method };
    });
  }

  private returnedFromLinesOf(saleId: string): Promise<BranchSaleFacts["sale"]["returned"]> {
    return this.db
      .select({
        saleLineId: returnLines.saleLineId,
        quantity: sql<number>`sum(${returnLines.quantity})::int`,
        refundedAmount: sql<number>`sum(${returnLines.refundedAmount})::bigint`.mapWith(Number),
      })
      .from(returnLines)
      .innerJoin(saleReturns, eq(saleReturns.id, returnLines.returnId))
      .where(eq(saleReturns.saleId, saleId))
      .groupBy(returnLines.saleLineId);
  }

  private async countedReturnIdsOf(saleId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: saleReturns.id })
      .from(saleReturns)
      .where(eq(saleReturns.saleId, saleId));
    return rows.map(({ id }) => id);
  }
}
