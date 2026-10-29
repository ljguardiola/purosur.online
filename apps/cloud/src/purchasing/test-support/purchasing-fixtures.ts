import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  categories,
  locations,
  productBarcodes,
  productPackagings,
  products,
  users,
} from "../../platform/db/schema.js";

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
  input: {
    name: string;
    saleUnit?: SaleUnit;
    active?: boolean;
    brandId?: string;
    netContent?: { quantity: number; unit: NetContentUnit };
  },
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
      brandId: input.brandId ?? null,
      netContentQuantity: input.netContent?.quantity ?? null,
      netContentUnit: input.netContent?.unit ?? null,
    })
    .returning({ id: products.id, version: products.version });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product;
}

export async function insertPackaging<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    productId: string;
    actorId: string;
    name?: string;
    quantityPerPackage?: number;
    saleUnit?: SaleUnit;
    active?: boolean;
  },
): Promise<string> {
  const [packaging] = await db
    .insert(productPackagings)
    .values({
      productId: input.productId,
      name: input.name ?? `Caja ${crypto.randomUUID()}`,
      quantityPerPackage: input.quantityPerPackage ?? 10_000,
      saleUnit: input.saleUnit ?? "UNIT",
      active: input.active ?? true,
      actorId: input.actorId,
    })
    .returning({ id: productPackagings.id });
  if (!packaging) {
    throw new Error("test setup: seeding the packaging returned no row");
  }
  return packaging.id;
}

export async function insertBarcode<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { productId: string; code: string; position?: number; active?: boolean },
): Promise<void> {
  await db.insert(productBarcodes).values({
    productId: input.productId,
    code: input.code,
    position: input.position ?? 0,
    active: input.active ?? true,
  });
}

export async function insertLeafCategory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Almacén ${crypto.randomUUID()}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}
