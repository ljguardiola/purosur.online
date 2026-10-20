import { splitOwedPresentations } from "@purosur/domain";
import type { OwedElsewherePresentationReader } from "@purosur/domain/alerts/use-cases";
import type { ListedOwedPresentation } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";

export class DrizzleOwedElsewherePresentationReader<TQueryResult extends PgQueryResultHKT>
  implements OwedElsewherePresentationReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async owedElsewhere(): Promise<ListedOwedPresentation[]> {
    const { owedElsewhere } = splitOwedPresentations(
      await new DrizzleOwedPresentationList(this.db).listed(),
      await new DrizzleOfflineAuthorizationCodeStore(this.db).ownedPointsOfSale(),
    );
    return owedElsewhere;
  }
}
