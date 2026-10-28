import {
  APPROVED_PAYMENT_STATE,
  buyerOfIssuedDocument,
  PAYMENT_METHODS,
  saleUnitOfWeightSource,
  WEIGHT_SOURCES,
  type WeightSource,
} from "@purosur/domain";
import type {
  IssuedFiscalDocumentDetail,
  IssuedFiscalDocumentDetailReader,
  IssuedFiscalDocumentLine,
  IssuedFiscalDocumentPayment,
  IssuedFiscalDocumentVoucher,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { discounts, saleLines, salePayments } from "../platform/db/schema.js";
import { documentOf, issuedDocuments } from "./drizzle-issued-fiscal-documents-reader.js";

function weightSourceOf(stored: string | null): WeightSource | null {
  if (stored === null) {
    return null;
  }
  const weightSource = WEIGHT_SOURCES.find((known) => known === stored);
  if (weightSource === undefined) {
    throw new Error(`weight source ${stored} is not one a sale line can have`);
  }
  return weightSource;
}

export class DrizzleIssuedFiscalDocumentDetailReader<TQueryResult extends PgQueryResultHKT>
  implements IssuedFiscalDocumentDetailReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async issuedDocumentOfBranch(
    locationId: string,
    voucher: IssuedFiscalDocumentVoucher,
  ): Promise<IssuedFiscalDocumentDetail | undefined> {
    const issued = issuedDocuments(this.db);
    const listedInBranch = and(eq(issued.locationId, locationId), sql`${issued.state} is not null`);
    const [row] = await this.db
      .select()
      .from(issued)
      .where(
        and(
          listedInBranch,
          eq(issued.voucherType, voucher.voucherType),
          eq(issued.pointOfSale, voucher.pointOfSale),
          eq(issued.number, voucher.number),
        ),
      )
      .limit(1);
    if (row === undefined) {
      return undefined;
    }
    const creditNotes = await this.db
      .select()
      .from(issued)
      .where(
        and(
          listedInBranch,
          eq(issued.correctedVoucherType, voucher.voucherType),
          eq(issued.correctedPointOfSale, voucher.pointOfSale),
          eq(issued.correctedNumber, voucher.number),
        ),
      )
      .orderBy(asc(issued.issuedAt), asc(issued.pointOfSale), asc(issued.number));
    return {
      ...documentOf(row),
      buyer: buyerOfIssuedDocument(row.buyerDocumentType, row.buyerDocumentNumber),
      lines: await this.linesOf(row.saleId),
      payments: await this.paymentsOf(row.saleId),
      creditNotes: creditNotes.map(documentOf),
    };
  }

  private async linesOf(saleId: string): Promise<IssuedFiscalDocumentLine[]> {
    const lines = await this.db
      .select({
        productName: saleLines.productName,
        quantity: saleLines.quantity,
        weightSource: saleLines.weightSource,
        promotionName: discounts.name,
        amount: saleLines.lineTotal,
      })
      .from(saleLines)
      .leftJoin(discounts, eq(discounts.id, saleLines.promotionId))
      .where(eq(saleLines.saleId, saleId));
    return lines.map((line) => ({
      productName: line.productName,
      saleUnit: saleUnitOfWeightSource(weightSourceOf(line.weightSource)),
      quantity: line.quantity,
      promotion: line.promotionName === null ? null : { name: line.promotionName },
      amount: line.amount,
    }));
  }

  private async paymentsOf(saleId: string): Promise<IssuedFiscalDocumentPayment[]> {
    const payments = await this.db
      .select({
        method: salePayments.method,
        cardType: salePayments.cardType,
        amount: salePayments.amount,
      })
      .from(salePayments)
      .where(and(eq(salePayments.saleId, saleId), eq(salePayments.state, APPROVED_PAYMENT_STATE)));
    return payments.map((payment) => {
      const method = PAYMENT_METHODS.find((known) => known === payment.method);
      if (method === undefined) {
        throw new Error(`payment method ${payment.method} is not one a payment can have`);
      }
      return { method, cardType: payment.cardType, amount: payment.amount };
    });
  }
}
