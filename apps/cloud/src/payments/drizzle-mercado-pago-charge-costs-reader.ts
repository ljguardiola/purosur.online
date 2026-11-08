import {
  APPROVED_PAYMENT_STATE,
  ARGENTINA_TIME_ZONE,
  MERCADO_PAGO_PAYMENT_METHODS,
  type MercadoPagoPaymentMethod,
} from "@purosur/domain";
import type {
  MercadoPagoChargeCostsReader,
  OtherMercadoPagoCharge,
  RecordedMercadoPagoCharge,
} from "@purosur/domain/payments/use-cases";
import { and, eq, exists, getTableColumns, notExists, sql } from "drizzle-orm";
import { alias, type PgColumn, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  mercadoPagoSettlementMovements as movements,
  paymentTransactions,
  registers,
} from "../platform/db/schema.js";

type Movement = typeof movements.$inferSelect;

function settlementMovementOf(row: Movement) {
  return {
    sourceId: row.sourceId,
    transactionType: row.transactionType,
    transactionDate: row.transactionDate,
    grossAmount: row.grossAmount,
    feeAmount: row.feeAmount,
    financingFeeAmount: row.financingFeeAmount,
    taxesAmount: row.taxesAmount,
    netAmount: row.netAmount,
    moneyReleaseDate: row.moneyReleaseDate,
  };
}

function methodOf(stored: string): MercadoPagoPaymentMethod {
  const method = MERCADO_PAGO_PAYMENT_METHODS.find((known) => known === stored);
  if (method !== undefined) {
    return method;
  }
  throw new Error(`A stored Mercado Pago payment transaction has an unknown method: ${stored}`);
}

function argentineDay(moment: PgColumn) {
  return sql<string>`to_char(${moment} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;
}

function referencesTransaction(reference: PgColumn) {
  return sql`${paymentTransactions.id}::text = lower(${reference})`;
}

export class DrizzleMercadoPagoChargeCostsReader<TQueryResult extends PgQueryResultHKT>
  implements MercadoPagoChargeCostsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async chargesOfPeriod({
    locationId,
    period,
  }: Parameters<MercadoPagoChargeCostsReader["chargesOfPeriod"]>[0]): Promise<
    RecordedMercadoPagoCharge[]
  > {
    const chargeDay = argentineDay(paymentTransactions.createdAt);
    const ofTheCharges = and(
      eq(registers.locationId, locationId),
      eq(paymentTransactions.state, APPROVED_PAYMENT_STATE),
      sql`${chargeDay} >= ${period.from}`,
      sql`${chargeDay} <= ${period.to}`,
    );
    const charges = await this.db
      .select({
        paymentTransactionId: paymentTransactions.id,
        saleId: paymentTransactions.saleId,
        method: paymentTransactions.method,
        registerId: paymentTransactions.registerId,
        registerName: registers.name,
        amount: paymentTransactions.amount,
        chargedAt: paymentTransactions.createdAt,
      })
      .from(paymentTransactions)
      .innerJoin(registers, eq(registers.id, paymentTransactions.registerId))
      .where(ofTheCharges);

    const links = this.db
      .selectDistinct({
        sourceId: movements.sourceId,
        paymentTransactionId: paymentTransactions.id,
      })
      .from(movements)
      .innerJoin(paymentTransactions, referencesTransaction(movements.externalReference))
      .innerJoin(registers, eq(registers.id, paymentTransactions.registerId))
      .where(ofTheCharges)
      .as("links");
    const linked = await this.db
      .select({
        paymentTransactionId: links.paymentTransactionId,
        movement: getTableColumns(movements),
      })
      .from(links)
      .innerJoin(movements, eq(movements.sourceId, links.sourceId));

    const movementsOf = new Map<string, Movement[]>();
    for (const { paymentTransactionId, movement } of linked) {
      movementsOf.set(paymentTransactionId, [
        ...(movementsOf.get(paymentTransactionId) ?? []),
        movement,
      ]);
    }
    return charges.map((charge) => ({
      ...charge,
      method: methodOf(charge.method),
      movements: (movementsOf.get(charge.paymentTransactionId) ?? []).map(settlementMovementOf),
    }));
  }

  async otherChargesOfPeriod({
    period,
  }: Parameters<MercadoPagoChargeCostsReader["otherChargesOfPeriod"]>[0]): Promise<
    OtherMercadoPagoCharge[]
  > {
    const explaining = alias(movements, "explaining_movements");
    const inThePeriod = alias(movements, "period_movements");
    const movementDay = argentineDay(inThePeriod.transactionDate);
    const rows = await this.db
      .select()
      .from(movements)
      .where(
        and(
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(explaining)
              .innerJoin(paymentTransactions, referencesTransaction(explaining.externalReference))
              .where(eq(explaining.sourceId, movements.sourceId)),
          ),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(inThePeriod)
              .where(
                and(
                  eq(inThePeriod.sourceId, movements.sourceId),
                  sql`${movementDay} >= ${period.from}`,
                  sql`${movementDay} <= ${period.to}`,
                ),
              ),
          ),
        ),
      );

    const bySource = new Map<string, OtherMercadoPagoCharge>();
    for (const row of rows) {
      const charge = bySource.get(row.sourceId) ?? { sourceId: row.sourceId, movements: [] };
      charge.movements.push(settlementMovementOf(row));
      bySource.set(row.sourceId, charge);
    }
    return [...bySource.values()];
  }
}
