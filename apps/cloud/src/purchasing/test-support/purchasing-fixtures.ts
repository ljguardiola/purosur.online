import type { SaleUnit } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, locations, products, users } from "../../platform/db/schema.js";

export async function insertActor<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  email = `ada-${crypto.randomUUID()}@example.com`,
): Promise<string> {
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email, locationId: location.id })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

export async function insertProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { name: string; saleUnit?: SaleUnit; active?: boolean },
): Promise<{ id: string; version: number }> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Categoría de ${input.name} ${crypto.randomUUID()}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({
      name: input.name,
      categoryId: category.id,
      saleUnit: input.saleUnit ?? "UNIT",
      active: input.active ?? true,
    })
    .returning({ id: products.id, version: products.version });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product;
}
