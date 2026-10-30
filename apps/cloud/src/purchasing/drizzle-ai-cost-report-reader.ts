import type { RecordedAiCall } from "@purosur/domain";
import type { AiCostReportQuery, AiCostReportReader } from "@purosur/domain/purchasing/use-cases";
import { and, eq, gte, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListAiCalls, suppliers, users } from "../platform/db/schema.js";

export class DrizzleAiCostReportReader<TQueryResult extends PgQueryResultHKT>
  implements AiCostReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordedCalls({ locationId, range }: AiCostReportQuery): Promise<RecordedAiCall[]> {
    const calls = await this.db
      .select({
        purpose: supplierPriceListAiCalls.purpose,
        occurredOn: supplierPriceListAiCalls.occurredOn,
        costNanoUsd: supplierPriceListAiCalls.costNanoUsd,
        supplierId: supplierPriceListAiCalls.supplierId,
        supplierName: suppliers.name,
        personId: supplierPriceListAiCalls.actorId,
        personName: users.firstName,
      })
      .from(supplierPriceListAiCalls)
      .innerJoin(suppliers, eq(suppliers.id, supplierPriceListAiCalls.supplierId))
      .innerJoin(users, eq(users.id, supplierPriceListAiCalls.actorId))
      .where(
        and(
          eq(supplierPriceListAiCalls.locationId, locationId),
          gte(supplierPriceListAiCalls.occurredOn, range.from),
          lte(supplierPriceListAiCalls.occurredOn, range.to),
        ),
      );
    return calls.map((call) => ({
      ...call,
      purpose: call.purpose as RecordedAiCall["purpose"],
    }));
  }
}
