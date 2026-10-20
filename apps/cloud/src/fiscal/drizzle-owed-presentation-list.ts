import { fortnightContaining, splitOwedPresentations } from "@purosur/domain";
import type {
  ListedOwedPresentation,
  OwedPresentationList,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { taxAuthorityOwedPresentations } from "../platform/db/schema.js";

export class DrizzleOwedPresentationList<TQueryResult extends PgQueryResultHKT>
  implements OwedPresentationList
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async listed(): Promise<ListedOwedPresentation[]> {
    const rows = await this.db
      .select({
        pointOfSaleNumber: taxAuthorityOwedPresentations.pointOfSaleNumber,
        fortnightStart: taxAuthorityOwedPresentations.fortnightStart,
      })
      .from(taxAuthorityOwedPresentations);
    return rows.map(({ pointOfSaleNumber, fortnightStart }) => ({
      pointOfSaleNumber,
      fortnight: fortnightContaining(fortnightStart),
    }));
  }

  async replace(list: ListedOwedPresentation[], at: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(taxAuthorityOwedPresentations);
      if (list.length === 0) {
        return;
      }
      await tx
        .insert(taxAuthorityOwedPresentations)
        .values(
          list.map(({ pointOfSaleNumber, fortnight }) => ({
            pointOfSaleNumber,
            fortnightStart: fortnight.start,
            listedAt: at,
          })),
        )
        .onConflictDoNothing();
    });
  }

  async resolve(key: ListedOwedPresentation): Promise<void> {
    await this.db.delete(taxAuthorityOwedPresentations).where(listedAs(key));
  }

  async clearOwedElsewhere(ownedPointsOfSale: readonly number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { owedElsewhere } = splitOwedPresentations(
        await new DrizzleOwedPresentationList(tx).listed(),
        ownedPointsOfSale,
      );
      if (owedElsewhere.length > 0) {
        await tx.delete(taxAuthorityOwedPresentations).where(or(...owedElsewhere.map(listedAs)));
      }
    });
  }
}

function listedAs({ pointOfSaleNumber, fortnight }: ListedOwedPresentation) {
  return and(
    eq(taxAuthorityOwedPresentations.pointOfSaleNumber, pointOfSaleNumber),
    eq(taxAuthorityOwedPresentations.fortnightStart, fortnight.start),
  );
}
