import type { PermissionKey, StockMovementKind } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  brands,
  categories,
  locations,
  products,
  rolePermissions,
  roles,
  sessions,
  stockBalances,
  stockCountLots,
  stockCounts,
  stockMovements,
  userRoles,
  users,
} from "../../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../../sessions/session-id.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

export const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

type Db = PgDatabase<PgQueryResultHKT>;

export async function insertLocation(db: Db): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

async function insertUserWith(
  db: Db,
  permissionKeys: readonly PermissionKey[],
  overrides: { isAdministrator?: boolean; locationId?: string } = {},
): Promise<{ userId: string; locationId: string }> {
  const [role] = overrides.isAdministrator
    ? await db.select({ id: roles.id }).from(roles).where(eq(roles.isAdministrator, true))
    : await db
        .insert(roles)
        .values({ name: "Encargada", isAdministrator: false })
        .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  const locationId = overrides.locationId ?? (await seededLocationId(db));
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `ada-${role.id}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return { userId: user.id, locationId };
}

async function insertSession(db: Db, userId: string, at: Date): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: at,
    lastSeenAt: at,
  });
  return rawSessionId;
}

export async function signedInWith(
  db: Db,
  permissionKeys: readonly PermissionKey[],
  at: Date,
  overrides: { isAdministrator?: boolean; locationId?: string } = {},
): Promise<{ userId: string; locationId: string; headers: Record<string, string> }> {
  const { userId, locationId } = await insertUserWith(db, permissionKeys, overrides);
  const rawSessionId = await insertSession(db, userId, at);
  return {
    userId,
    locationId,
    headers: { origin: BACKOFFICE_ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
  };
}

async function brandIdNamed(db: Db, name: string): Promise<string> {
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.name, name));
  if (existing) {
    return existing.id;
  }
  const [brand] = await db.insert(brands).values({ name }).returning({ id: brands.id });
  if (!brand) {
    throw new Error("test setup: seeding the brand returned no row");
  }
  return brand.id;
}

export async function insertProduct(
  db: Db,
  overrides: {
    name?: string;
    categoryName?: string;
    saleUnit?: "UNIT" | "KG";
    active?: boolean;
    brandName?: string;
    netContent?: { quantity: number; unit: "G" | "KG" | "ML" | "L" | "UNIT" };
  } = {},
): Promise<{ productId: string; categoryId: string }> {
  const categoryName = overrides.categoryName ?? "Almacén";
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, categoryName));
  const [category] = existing
    ? [existing]
    : await db.insert(categories).values({ name: categoryName }).returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const brandId =
    overrides.brandName === undefined ? undefined : await brandIdNamed(db, overrides.brandName);
  const [product] = await db
    .insert(products)
    .values({
      name: overrides.name ?? "Miel pura de abeja 1 kg",
      categoryId: category.id,
      brandId,
      saleUnit: overrides.saleUnit ?? "UNIT",
      netContentQuantity: overrides.netContent?.quantity,
      netContentUnit: overrides.netContent?.unit,
      active: overrides.active ?? true,
    })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return { productId: product.id, categoryId: category.id };
}

export async function insertBalance(
  db: Db,
  row: { productId: string; locationId: string; quantity: number },
): Promise<void> {
  await db.insert(stockBalances).values(row);
}

export async function insertMovement(
  db: Db,
  row: {
    productId: string;
    locationId: string;
    actorId: string;
    kind: StockMovementKind;
    reason?: string | null;
    delta: number;
    occurredAt: Date;
    supersededByCountId?: string | null;
    assemblyBatchId?: string;
    count?: { counted: number; expected: number; lots?: { lotId: string; counted: number }[] };
  },
): Promise<string> {
  const { count, ...movement } = row;
  const [inserted] = await db
    .insert(stockMovements)
    .values({ ...movement, reason: movement.reason ?? null })
    .returning({ id: stockMovements.id });
  if (!inserted) {
    throw new Error("test setup: seeding the movement returned no row");
  }
  if (count) {
    const { lots, ...stored } = count;
    await db.insert(stockCounts).values({ movementId: inserted.id, ...stored });
    if (lots && lots.length > 0) {
      await db
        .insert(stockCountLots)
        .values(lots.map((lot) => ({ movementId: inserted.id, ...lot })));
    }
  }
  return inserted.id;
}
