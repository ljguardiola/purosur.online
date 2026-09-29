import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME } from "../../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../../access/session-id.js";
import {
  brands,
  categories,
  products,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../../platform/db/schema.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

type Db = TestDatabase["db"];

async function insertUserWithRole(db: Db, roleId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertSession(db: Db, userId: string, now: Date): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
  });
  return rawSessionId;
}

export async function signedInWithPermissions(
  db: Db,
  now: Date,
  permissionKeys: string[] = ["manage_products_and_categories"],
): Promise<string> {
  const [role] = await db
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
  return insertSession(db, await insertUserWithRole(db, role.id), now);
}

export async function signedInAsAdministrator(db: Db, now: Date): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return insertSession(db, await insertUserWithRole(db, administratorRole.id), now);
}

export function sessionCookie(rawSessionId: string | undefined): Record<string, string> {
  return rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {};
}

export async function insertBrand(
  db: Db,
  input: { name: string; active?: boolean; version?: number },
): Promise<{ id: string; version: number }> {
  const [brand] = await db
    .insert(brands)
    .values(input)
    .returning({ id: brands.id, version: brands.version });
  if (!brand) {
    throw new Error("test setup: seeding the brand returned no row");
  }
  return brand;
}

export async function insertProductOfBrand(
  db: Db,
  input: { name: string; brandId: string | null; active?: boolean },
): Promise<void> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Categoría de ${input.name}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  await db.insert(products).values({
    name: input.name,
    categoryId: category.id,
    brandId: input.brandId,
    saleUnit: "UNIT",
    active: input.active ?? true,
  });
}
