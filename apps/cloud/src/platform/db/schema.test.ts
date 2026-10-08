import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALERT_AUDIENCES,
  ALERT_LEVELS,
  DISCOUNT_TARGET_KINDS,
  type DiscountBenefit,
  isTargetKindAllowedFor,
} from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  onTestFinished,
} from "vitest";
import { generateSessionId, hashSessionId } from "../../access/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import { MIGRATIONS_FOLDER } from "./migrations-folder.js";
import {
  brands,
  categories,
  discounts,
  locations,
  passkeyChallenges,
  priceLists,
  priceReviews,
  prices,
  products,
  productTags,
  roles,
  sessions,
  tags,
  userRoles,
  users,
} from "./schema.js";
import {
  findMigrationEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertUser(email: string): Promise<{ id: string }> {
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email, locationId: location.id })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user;
}

async function databaseEnumValues(typeName: string): Promise<string[]> {
  const { rows } = await testDatabase.client.query<{ enumlabel: string }>(
    "select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = $1 order by enumsortorder",
    [typeName],
  );
  return rows.map((row) => row.enumlabel);
}

describe("alert_level", () => {
  it("allows exactly the domain's alert levels, in the domain's order", async () => {
    expect(await databaseEnumValues("alert_level")).toEqual(ALERT_LEVELS);
  });
});

describe("alert_audience", () => {
  it("allows exactly the domain's alert audiences, in the domain's order", async () => {
    expect(await databaseEnumValues("alert_audience")).toEqual(ALERT_AUDIENCES);
  });
});

describe("locations", () => {
  it("is seeded with exactly one row, the business's single branch", async () => {
    const seededLocations = await db.select().from(locations);

    expect(seededLocations).toHaveLength(1);
  });
});

describe("users.location_id", () => {
  it("rejects a user row with no location", async () => {
    await expect(
      db.execute(
        sql`insert into "users" ("first_name", "email") values ('Ada', 'ada@example.com')`,
      ),
    ).rejects.toMatchObject({ cause: { column: "location_id" } });
  });
});

describe("categories.parent_id", () => {
  it("rejects a category that is its own parent", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("test setup: inserting the category returned no row");
    }

    await expect(
      db.update(categories).set({ parentId: category.id }).where(eq(categories.id, category.id)),
    ).rejects.toMatchObject({ cause: { constraint: "categories_parent_is_not_itself" } });
  });
});

describe("brands.name", () => {
  it("rejects a second brand with the same name in another letter case, even when the first is deactivated", async () => {
    await db.insert(brands).values({ name: "Vitaco", active: false });

    await expect(db.insert(brands).values({ name: "vITACO" })).rejects.toMatchObject({
      cause: { constraint: "brands_name_lower_key" },
    });
  });

  it("starts a brand active at version 1", async () => {
    const [brand] = await db.insert(brands).values({ name: "Granix" }).returning();

    expect(brand).toMatchObject({ name: "Granix", active: true, version: 1 });
  });
});

describe("products.brand_id", () => {
  it("starts a product with no brand and rejects a brand that doesn't exist", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("test setup: inserting the category returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Dátiles", categoryId: category.id, saleUnit: "KG" })
      .returning();

    expect(product).toMatchObject({ brandId: null });
    await expect(
      db.insert(products).values({
        name: "Galletitas",
        categoryId: category.id,
        saleUnit: "UNIT",
        brandId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ cause: { constraint: "products_brand_id_brands_id_fk" } });
  });
});

describe("tags.name", () => {
  it("rejects a second tag with the same name in another letter case, even when the first is deactivated", async () => {
    await db.insert(tags).values({ name: "Vegano", active: false });

    await expect(db.insert(tags).values({ name: "vEGANO" })).rejects.toMatchObject({
      cause: { constraint: "tags_name_lower_key" },
    });
  });

  it("starts a tag active at version 1", async () => {
    const [tag] = await db.insert(tags).values({ name: "Sin TACC" }).returning();

    expect(tag).toMatchObject({ name: "Sin TACC", active: true, version: 1 });
  });
});

describe("product_tags", () => {
  async function seedProductAndTag(): Promise<{ productId: string; tagId: string }> {
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    const [tag] = await db.insert(tags).values({ name: "Orgánico" }).returning({ id: tags.id });
    if (!category || !tag) {
      throw new Error("test setup: seeding the category and the tag returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Dátiles", categoryId: category.id, saleUnit: "KG" })
      .returning({ id: products.id });
    if (!product) {
      throw new Error("test setup: seeding the product returned no row");
    }
    return { productId: product.id, tagId: tag.id };
  }

  it("rejects the same tag twice on one product", async () => {
    const { productId, tagId } = await seedProductAndTag();
    await db.insert(productTags).values({ productId, tagId });

    await expect(db.insert(productTags).values({ productId, tagId })).rejects.toMatchObject({
      cause: { constraint: "product_tags_product_id_tag_id_pk" },
    });
  });

  it("rejects a tag that doesn't exist", async () => {
    const { productId } = await seedProductAndTag();

    await expect(
      db.insert(productTags).values({ productId, tagId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ cause: { constraint: "product_tags_tag_id_tags_id_fk" } });
  });

  it("rejects a product that doesn't exist", async () => {
    const { tagId } = await seedProductAndTag();

    await expect(
      db.insert(productTags).values({ productId: "00000000-0000-0000-0000-000000000000", tagId }),
    ).rejects.toMatchObject({ cause: { constraint: "product_tags_product_id_products_id_fk" } });
  });
});

describe("discounts", () => {
  async function seedTargets(): Promise<{ productId: string; categoryId: string; tagId: string }> {
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    const [tag] = await db.insert(tags).values({ name: "Orgánico" }).returning({ id: tags.id });
    if (!category || !tag) {
      throw new Error("test setup: seeding the category and the tag returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Dátiles", categoryId: category.id, saleUnit: "KG" })
      .returning({ id: products.id });
    if (!product) {
      throw new Error("test setup: seeding the product returned no row");
    }
    return { productId: product.id, categoryId: category.id, tagId: tag.id };
  }

  function discountOn(
    target: Partial<typeof discounts.$inferInsert>,
  ): typeof discounts.$inferInsert {
    return {
      name: "Semana de los frutos secos",
      kind: "PERCENT_OFF",
      percent: 15,
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      ...target,
    };
  }

  it("starts a discount active at version 1 with no weekday restriction", async () => {
    const { categoryId } = await seedTargets();

    const [discount] = await db.insert(discounts).values(discountOn({ categoryId })).returning();

    expect(discount).toMatchObject({ active: true, version: 1, weekdays: [] });
  });

  it.each(["productId", "categoryId", "tagId"] as const)(
    "accepts a discount aimed at exactly one %s",
    async (column) => {
      const targets = await seedTargets();

      await expect(
        db.insert(discounts).values(discountOn({ [column]: targets[column] })),
      ).resolves.toBeDefined();
    },
  );

  it("rejects a discount aimed at nothing", async () => {
    await expect(db.insert(discounts).values(discountOn({}))).rejects.toMatchObject({
      cause: { constraint: "discounts_exactly_one_target_check" },
    });
  });

  it("rejects a discount aimed at two targets", async () => {
    const { productId, tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ productId, tagId })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_exactly_one_target_check" } });
  });

  it.each([
    ["productId", "discounts_product_id_products_id_fk"],
    ["categoryId", "discounts_category_id_categories_id_fk"],
    ["tagId", "discounts_tag_id_tags_id_fk"],
  ] as const)("rejects a %s that does not exist", async (column, constraint) => {
    await expect(
      db.insert(discounts).values(discountOn({ [column]: "00000000-0000-0000-0000-000000000000" })),
    ).rejects.toMatchObject({ cause: { constraint } });
  });

  it("rejects a discount of a kind that is not listed", async () => {
    const { tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ tagId, kind: "BUY_ONE" })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_kind_check" } });
  });

  function buyNPayMOn(
    target: Partial<typeof discounts.$inferInsert>,
  ): typeof discounts.$inferInsert {
    return discountOn({ kind: "BUY_N_PAY_M", percent: null, buyQty: 3, payQty: 2, ...target });
  }

  it.each([
    [2, 1],
    [3, 2],
    [12, 11],
  ])("accepts a buy-N-pay-M discount buying %s and paying %s", async (buyQty, payQty) => {
    const { productId } = await seedTargets();

    await expect(
      db.insert(discounts).values(buyNPayMOn({ productId, buyQty, payQty })),
    ).resolves.toBeDefined();
  });

  it.each([
    [2, 2],
    [3, 4],
    [1, 0],
    [3, 0],
    [3, null],
    [null, 2],
  ])("rejects a buy-N-pay-M discount buying %s and paying %s", async (buyQty, payQty) => {
    const { productId } = await seedTargets();

    await expect(
      db.insert(discounts).values(buyNPayMOn({ productId, buyQty, payQty })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_buy_n_pay_m_quantities_check" } });
  });

  it("rejects a buy-N-pay-M discount that also carries a percent", async () => {
    const { productId } = await seedTargets();

    await expect(
      db.insert(discounts).values(buyNPayMOn({ productId, percent: 15 })),
    ).rejects.toMatchObject({
      cause: { constraint: "discounts_buy_n_pay_m_has_no_percent_check" },
    });
  });

  it.each([
    [3, 2],
    [3, null],
    [null, 2],
  ])("rejects a percent-off discount that also buys %s and pays %s", async (buyQty, payQty) => {
    const { tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ tagId, buyQty, payQty })),
    ).rejects.toMatchObject({
      cause: { constraint: "discounts_percent_off_has_no_quantities_check" },
    });
  });

  it.each(["categoryId", "tagId"] as const)(
    "rejects a buy-N-pay-M discount aimed at a %s instead of a product",
    async (column) => {
      const targets = await seedTargets();

      await expect(
        db.insert(discounts).values(buyNPayMOn({ [column]: targets[column] })),
      ).rejects.toMatchObject({ cause: { constraint: "discounts_buy_n_pay_m_product_check" } });
    },
  );

  it("stores a discount of each benefit on each kind of target exactly when the domain allows it", async () => {
    const targets = await seedTargets();
    const targetColumns = {
      PRODUCT: "productId",
      CATEGORY: "categoryId",
      TAG: "tagId",
    } as const satisfies Record<(typeof DISCOUNT_TARGET_KINDS)[number], string>;
    const benefitRows = {
      PERCENT_OFF: { kind: "PERCENT_OFF", percent: 15, buyQty: null, payQty: null },
      BUY_N_PAY_M: { kind: "BUY_N_PAY_M", percent: null, buyQty: 3, payQty: 2 },
    } as const satisfies Record<DiscountBenefit["kind"], Partial<typeof discounts.$inferInsert>>;

    const stored: [string, string, boolean][] = [];
    const allowed: [string, string, boolean][] = [];
    for (const benefitKind of Object.keys(benefitRows) as DiscountBenefit["kind"][]) {
      for (const targetKind of DISCOUNT_TARGET_KINDS) {
        const column = targetColumns[targetKind];
        const accepted = await db
          .insert(discounts)
          .values(discountOn({ ...benefitRows[benefitKind], [column]: targets[column] }))
          .then(
            () => true,
            () => false,
          );
        stored.push([benefitKind, targetKind, accepted]);
        allowed.push([benefitKind, targetKind, isTargetKindAllowedFor(benefitKind, targetKind)]);
      }
    }

    expect(stored).toEqual(allowed);
  });

  it.each([0, 100, -5])("rejects a percent-off discount of %s percent", async (percent) => {
    const { tagId } = await seedTargets();

    await expect(db.insert(discounts).values(discountOn({ tagId, percent }))).rejects.toMatchObject(
      { cause: { constraint: "discounts_percent_check" } },
    );
  });

  it("rejects a percent-off discount without a percent", async () => {
    const { tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ tagId, percent: null })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_percent_check" } });
  });

  it.each([1, 99])("accepts a percent-off discount of %s percent", async (percent) => {
    const { tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ tagId, percent })),
    ).resolves.toBeDefined();
  });

  it("accepts a discount that ends the day it starts and rejects one that ends before", async () => {
    const { tagId } = await seedTargets();

    await expect(
      db
        .insert(discounts)
        .values(discountOn({ tagId, validFrom: "2026-10-01", validTo: "2026-10-01" })),
    ).resolves.toBeDefined();
    await expect(
      db
        .insert(discounts)
        .values(discountOn({ tagId, validFrom: "2026-10-02", validTo: "2026-10-01" })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_valid_to_not_before_from_check" } });
  });

  it.each([[[0]], [[8]], [[2, 9]]])("rejects the weekdays %j", async (weekdays) => {
    const { tagId } = await seedTargets();

    await expect(
      db.insert(discounts).values(discountOn({ tagId, weekdays })),
    ).rejects.toMatchObject({ cause: { constraint: "discounts_weekdays_check" } });
  });

  it("keeps the weekdays it was given", async () => {
    const { tagId } = await seedTargets();

    const [discount] = await db
      .insert(discounts)
      .values(discountOn({ tagId, weekdays: [2, 4] }))
      .returning({ weekdays: discounts.weekdays });

    expect(discount?.weekdays).toEqual([2, 4]);
  });
});

describe("user_roles", () => {
  it("rejects a second role for a user that already holds one", async () => {
    const user = await insertUser("ada@example.com");
    const [cashierRole] = await db
      .insert(roles)
      .values({ name: "Cashier", isAdministrator: false })
      .returning({ id: roles.id });
    const [managerRole] = await db
      .insert(roles)
      .values({ name: "Manager", isAdministrator: false })
      .returning({ id: roles.id });
    if (!cashierRole || !managerRole) {
      throw new Error("test setup: inserting a role returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: cashierRole.id });

    await expect(
      db.insert(userRoles).values({ userId: user.id, roleId: managerRole.id }),
    ).rejects.toMatchObject({ cause: { constraint: "user_roles_user_id_key" } });
  });
});

describe("price_reviews.price_id", () => {
  it("rejects a review of one product pointing at another product's price", async () => {
    const actor = await insertUser("ada@example.com");
    const [priceList] = await db.select({ id: priceLists.id }).from(priceLists);
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    if (!priceList || !category) {
      throw new Error(
        "test setup: no price list seeded, or inserting the category returned no row",
      );
    }
    const [rice, noodles] = await db
      .insert(products)
      .values([
        { name: "Arroz", categoryId: category.id, saleUnit: "UNIT" },
        { name: "Fideos", categoryId: category.id, saleUnit: "UNIT" },
      ])
      .returning({ id: products.id });
    if (!rice || !noodles) {
      throw new Error("test setup: inserting the products returned no row");
    }
    const [ricePrice] = await db
      .insert(prices)
      .values({ productId: rice.id, priceListId: priceList.id, unitPrice: 1000 })
      .returning({ id: prices.id });
    if (!ricePrice) {
      throw new Error("test setup: inserting the price returned no row");
    }

    await expect(
      db.insert(priceReviews).values({
        productId: noodles.id,
        priceListId: priceList.id,
        actorId: actor.id,
        priceId: ricePrice.id,
      }),
    ).rejects.toMatchObject({ cause: { constraint: "price_reviews_price_product_price_list_fk" } });
  });
});

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const [session] = await db
    .insert(sessions)
    .values({ userId, sessionIdHash: hashSessionId(rawSessionId) })
    .returning({ id: sessions.id });
  if (!session) {
    throw new Error("test setup: inserting the session returned no row");
  }
  return session.id;
}

describe("sessions.passkey_authorized_at", () => {
  it("defaults to null", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

    expect(session?.passkeyAuthorizedAt).toBeNull();
  });

  it("stores the timestamp it is set to", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);
    const authorizedAt = new Date("2026-01-05T12:00:00.000Z");

    await db
      .update(sessions)
      .set({ passkeyAuthorizedAt: authorizedAt })
      .where(eq(sessions.id, sessionId));

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session?.passkeyAuthorizedAt).toEqual(authorizedAt);
  });
});

describe("passkey_challenges.kind", () => {
  it("accepts registration and session_authorization, rejecting a removed kind", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);

    await expect(
      db.execute(
        sql`insert into passkey_challenges (session_id, kind, registration_challenge)
            values (${sessionId}, 'role_creation', 'a-registration-challenge')`,
      ),
    ).rejects.toBeTruthy();

    await db.insert(passkeyChallenges).values({
      sessionId,
      kind: "session_authorization",
      reauthenticationChallenge: "an-assertion-challenge",
    });
    const [stored] = await db
      .select()
      .from(passkeyChallenges)
      .where(eq(passkeyChallenges.sessionId, sessionId));
    expect(stored).toMatchObject({ kind: "session_authorization" });
  });
});

describe("migrating a database with a pending passkey challenge of a removed kind", {
  timeout: 30_000,
}, () => {
  async function migrationsFolderBeforeAuthorizationReuse(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "migrations-before-authorization-reuse-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const authorizationReuseEntry = await findMigrationEntry(
      "_reuse_passkey_authorization",
      "test setup: no passkey authorization reuse migration in the journal",
    );
    await migrationsFolderBefore(folder, authorizationReuseEntry);
    return folder;
  }

  async function sessionOnDatabaseBeforeAuthorizationReuse() {
    const priorMigrationsFolder = await migrationsFolderBeforeAuthorizationReuse();
    const client = await migrateFreshDatabase(
      priorMigrationsFolder,
      inject("testDatabaseClusterDumpPath"),
    );
    onTestFinished(() => client.close());
    const { rows: userRows } = await client.query<{ id: string }>(
      `insert into "users" ("first_name", "email", "location_id") values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning "id"`,
    );
    const userId = userRows[0]?.id;
    const { rows: sessionRows } = await client.query<{ id: string }>(
      `insert into "sessions" ("user_id", "session_id_hash") values ('${userId}', 'a-session-hash') returning "id"`,
    );
    return { client, sessionId: sessionRows[0]?.id };
  }

  it("deletes a pending registration issued before passkey registration required an authorization", async () => {
    const { client, sessionId } = await sessionOnDatabaseBeforeAuthorizationReuse();
    await client.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge", "registration_challenge") values ('${sessionId}', 'registration', 'a-stale-reauthentication', 'a-stale-registration')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: remaining } = await client.query(
      `select * from "passkey_challenges" where "session_id" = '${sessionId}'`,
    );
    expect(remaining).toHaveLength(0);
  });

  it("deletes the pending row instead of leaving a kind the new enum no longer has", async () => {
    const { client, sessionId } = await sessionOnDatabaseBeforeAuthorizationReuse();
    await client.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge") values ('${sessionId}', 'role_creation', 'a-stale-challenge')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: remaining } = await client.query(
      `select * from "passkey_challenges" where "session_id" = '${sessionId}'`,
    );
    expect(remaining).toHaveLength(0);
    const { rows: enumValues } = await client.query<{ enumlabel: string }>(
      `select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'passkey_management_challenge_kind' order by enumsortorder`,
    );
    expect(enumValues.map((row) => row.enumlabel)).toEqual([
      "registration",
      "session_authorization",
    ]);
  });
});

describe("migrating a database that already has users", { timeout: 30_000 }, () => {
  async function migrationsFolderBeforeLocations(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "migrations-before-locations-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const locationsEntry = await findMigrationEntry(
      "_locations",
      "test setup: no locations migration in the journal",
    );
    await migrationsFolderBefore(folder, locationsEntry);
    return folder;
  }

  it("backfills every existing user onto the seeded location", async () => {
    const priorMigrationsFolder = await migrationsFolderBeforeLocations();
    const client = await migrateFreshDatabase(
      priorMigrationsFolder,
      inject("testDatabaseClusterDumpPath"),
    );
    onTestFinished(() => client.close());
    await client.query(
      `insert into "users" ("first_name", "email") values ('Ada', 'ada@example.com')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: locationRows } = await client.query<{ id: string }>(
      `select "id" from "locations"`,
    );
    const { rows: userRows } = await client.query<{ location_id: string }>(
      `select "location_id" from "users"`,
    );
    expect(locationRows).toHaveLength(1);
    expect(userRows).toEqual([{ location_id: locationRows[0]?.id }]);
  });
});
