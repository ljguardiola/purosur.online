import type { CatalogNetContent } from "@purosur/domain/catalog/use-cases";
import { formatProductDescription } from "@purosur/formatting";
import { and, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { containsText } from "../platform/contains-pattern.js";

export interface DescribedProduct {
  id: string;
  name: string;
  brandName: string | null;
  netContent: CatalogNetContent | null;
}

export async function productIdsWithDescriptionContainingEveryWord<
  TQueryResult extends PgQueryResultHKT,
>(
  db: PgDatabase<TQueryResult>,
  products: readonly DescribedProduct[],
  search: string,
): Promise<Set<string>> {
  const shownDescriptions = JSON.stringify(
    products.map((product) => ({
      id: product.id,
      description: formatProductDescription(product),
    })),
  );
  const description = sql`shown.description`;
  const matching = await db
    .select({ id: sql<string>`shown.id` })
    .from(sql`jsonb_to_recordset(${shownDescriptions}::jsonb) as shown(id uuid, description text)`)
    .where(and(...search.split(/\s+/).map((word) => containsText(description, word))));
  return new Set(matching.map((row) => row.id));
}
