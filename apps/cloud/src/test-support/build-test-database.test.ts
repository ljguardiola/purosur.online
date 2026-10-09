import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import {
  alertDeliveries,
  alerts,
  arcaInvoicingEvidence,
  arcaVitalityChecks,
  arcaWsaaTokens,
  auditLog,
  backofficeRateLimitAttempts,
  branchHours,
  branchSettings,
  brands,
  buyerIdentificationThresholds,
  buyerTaxStatusSets,
  cashMovements,
  cashSessions,
  categories,
  changes,
  deviceState,
  discounts,
  fiscalAddresses,
  fiscalRequests,
  inbox,
  installationRequestAttempts,
  issuerIdentification,
  issuerIdentificationVersions,
  locations,
  passkeyChallenges,
  passkeys,
  paymentRefunds,
  pinCodeRedemptionAttempts,
  pointOfSaleClaims,
  priceLists,
  priceReviews,
  prices,
  productBarcodes,
  products,
  productTags,
  recoveryRateLimitAttempts,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  refusedEvents,
  registerContingencyTicketKeys,
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registerPointsOfSale,
  registerSnapshotKeys,
  registers,
  rolePermissions,
  roles,
  saleLines,
  salePayments,
  sales,
  sessions,
  signInChallenges,
  signInFailures,
  signInLockouts,
  signInLookupAttempts,
  stockBalances,
  stockCounts,
  stockMovements,
  tags,
  taxAuthorityLastAuthorizedNumbers,
  userPinCodes,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "./build-test-database.js";
import { seededLocationId } from "./seeded-location.js";
import { seededPriceListId } from "./seeded-price-list.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

vi.mock(import("./test-database-snapshot.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, migrateFreshDatabase: vi.fn(actual.migrateFreshDatabase) };
});

async function countsByTable(client: PGlite): Promise<Map<string, number>> {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  const counts = new Map<string, number>();
  for (const { tablename } of rows) {
    const result = await client.query<{ count: number }>(`select count(*) from "${tablename}"`);
    counts.set(tablename, result.rows[0]?.count ?? 0);
  }
  return counts;
}

async function snapshotPathWithMarkerRole(): Promise<string> {
  const seed = await buildTestDatabase();
  onTestFinished(() => seed.close());
  await seed.client.query(
    `insert into "roles" ("name", "is_administrator") values ('marker-role', false)`,
  );

  const dump = await seed.client.dumpDataDir("none");
  const folder = await mkdtemp(join(tmpdir(), "build-test-database-snapshot-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, "snapshot.tar");
  await writeFile(path, Buffer.from(await dump.arrayBuffer()));
  return path;
}

async function clusterDumpPathWithMarkerTable(): Promise<string> {
  const runClusterDumpPath = inject("testDatabaseClusterDumpPath");
  const client = new PGlite({ loadDataDir: new Blob([await readFile(runClusterDumpPath)]) });
  onTestFinished(() => client.close());
  await client.query('create table "cluster_dump_marker" ("id" integer primary key)');
  await client.query('insert into "cluster_dump_marker" ("id") values (1)');

  const dump = await client.dumpDataDir("none");
  const folder = await mkdtemp(join(tmpdir(), "build-test-database-cluster-dump-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, "cluster-dump.tar");
  await writeFile(path, Buffer.from(await dump.arrayBuffer()));
  return path;
}

async function migrationsFolderWith(statements: string[]): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "build-test-database-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, "meta"));
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: 0, tag: "0000_only", breakpoints: true }],
    }),
  );
  await writeFile(join(folder, "0000_only.sql"), statements.join("\n--> statement-breakpoint\n"));
  return folder;
}

describe("buildTestDatabase", { timeout: 30_000 }, () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it("empties every application table on clear(), restoring only what the migrations themselves seeded", async () => {
    const { db, client, clear } = testDatabase;
    onTestFinished(clear);

    const baseline = await countsByTable(client);
    expect(baseline.size).toBeGreaterThanOrEqual(12);
    expect(baseline.get("roles")).toBe(1);
    expect(baseline.get("locations")).toBe(1);
    expect(baseline.get("branch_settings")).toBe(1);
    expect(baseline.get("issuer_identification")).toBe(1);
    expect(baseline.get("price_lists")).toBe(1);

    const [user] = await db
      .insert(users)
      .values({
        firstName: "Ada",
        email: "ada@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    const [role] = await db
      .insert(roles)
      .values({ name: "Cashier", isAdministrator: false })
      .returning({ id: roles.id });
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!user || !role || !otherLocation) {
      throw new Error("seeding users/roles/locations returned no row");
    }

    await db
      .insert(branchSettings)
      .values({ locationId: otherLocation.id, priceListId: await seededPriceListId(db) });
    await db.insert(branchHours).values({
      locationId: otherLocation.id,
      dayOfWeek: 1,
      position: 0,
      opensAt: "09:00",
      closesAt: "18:00",
    });
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    await db.insert(rolePermissions).values({ roleId: role.id, permissionKey: "sell_and_charge" });
    const [category] = await db
      .insert(categories)
      .values({ name: "Semillas" })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("seeding categories returned no row");
    }
    const [brand] = await db.insert(brands).values({ name: "Granix" }).returning({ id: brands.id });
    if (!brand) {
      throw new Error("seeding brands returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Alpiste", categoryId: category.id, brandId: brand.id, saleUnit: "KG" })
      .returning({ id: products.id });
    if (!product) {
      throw new Error("seeding products returned no row");
    }
    await db.insert(productBarcodes).values({ productId: product.id, code: "111", position: 0 });
    const [tag] = await db.insert(tags).values({ name: "Orgánico" }).returning({ id: tags.id });
    if (!tag) {
      throw new Error("seeding tags returned no row");
    }
    await db.insert(productTags).values({ productId: product.id, tagId: tag.id });
    await db.insert(discounts).values({
      name: "Semana de los frutos secos",
      kind: "PERCENT_OFF",
      percent: 15,
      tagId: tag.id,
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
    });
    const [otherPriceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    if (!otherPriceList) {
      throw new Error("seeding price lists returned no row");
    }
    const [price] = await db
      .insert(prices)
      .values({ productId: product.id, priceListId: await seededPriceListId(db), unitPrice: 500 })
      .returning({ id: prices.id });
    if (!price) {
      throw new Error("seeding prices returned no row");
    }
    await db.insert(priceReviews).values({
      productId: product.id,
      priceListId: await seededPriceListId(db),
      priceId: price.id,
      actorId: user.id,
    });
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) {
      throw new Error("seeding registers returned no row");
    }
    const [fiscalAddress] = await db
      .insert(fiscalAddresses)
      .values({ name: "Casa central", streetAddress: "Calle Ficticia 123" })
      .returning({ id: fiscalAddresses.id });
    if (!fiscalAddress) {
      throw new Error("seeding fiscal addresses returned no row");
    }
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 3, registerId: register.id, claimedBy: user.id });
    await db.insert(registerPointsOfSale).values({
      registerId: register.id,
      pointOfSaleNumber: 3,
      fiscalAddressId: fiscalAddress.id,
      version: 1,
    });
    await db.insert(registerEnrollmentCodes).values({
      registerId: register.id,
      codeLookup: "ABCD",
      codeHash: "code-hash",
      issuedAt: new Date("2026-01-05T12:00:00.000Z"),
      expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    });
    const [installation] = await db
      .insert(registerInstallations)
      .values({
        registerId: register.id,
        tokenLookupPrefix: "token-prefix",
        tokenHash: "token-hash",
        tokenIssuedAt: new Date("2026-01-05T12:00:00.000Z"),
        hostname: "CAJA",
        windowsVersion: "Windows 11",
        enrolledAt: new Date("2026-01-05T12:00:00.000Z"),
      })
      .returning({ id: registerInstallations.id });
    if (!installation) {
      throw new Error("seeding the installation returned no row");
    }
    await db.insert(deviceState).values({
      deviceId: installation.id,
      lastPullSince: 0,
      lastPulledAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(inbox).values({
      eventId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e0f",
      deviceId: installation.id,
      deviceSeq: 1,
      aggregateType: "cash_session",
      aggregateId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e10",
      eventType: "cash_session_opened",
      schemaVersion: 1,
      payload: {},
      occurredAt: new Date("2026-01-05T12:00:00.000Z"),
      actorId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e11",
      chainHmac: "chain-hmac",
      receivedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    const sessionId = "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e10";
    const saleId = "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e20";
    const origin = {
      locationId: await seededLocationId(db),
      registerId: register.id,
      deviceId: installation.id,
    };
    await db.insert(cashSessions).values({
      id: sessionId,
      ...origin,
      openedBy: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e11",
      openedAt: new Date("2026-01-05T12:00:00.000Z"),
      openingFloat: 10000,
    });
    await db.insert(sales).values({
      id: saleId,
      ...origin,
      sessionId,
      actorId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e11",
      state: "COMPLETED",
      completedAt: new Date("2026-01-05T12:10:00.000Z"),
      total: 2400,
      appliedAt: new Date("2026-01-05T12:11:00.000Z"),
    });
    await db.insert(saleLines).values({
      id: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e21",
      saleId,
      productId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e22",
      productName: "Azucar",
      quantity: 1,
      listUnitPrice: 2400,
      priceListId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e23",
      discountAmount: 0,
      lineTotal: 2400,
    });
    await db.insert(salePayments).values({
      id: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e24",
      saleId,
      method: "CASH",
      provider: "NONE",
      amount: 2400,
      tendered: 2400,
      state: "APPROVED",
      occurredAt: new Date("2026-01-05T12:10:00.000Z"),
    });
    await db.insert(paymentRefunds).values({
      id: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e26",
      saleId,
      paymentId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e24",
      method: "CASH",
      provider: "NONE",
      amount: 2400,
      state: "APPROVED",
      occurredAt: new Date("2026-01-05T12:12:00.000Z"),
    });
    await db.insert(cashMovements).values({
      id: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e25",
      sessionId,
      type: "SALE",
      amount: 2400,
      actorId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e11",
      occurredAt: new Date("2026-01-05T12:10:00.000Z"),
    });
    await db.insert(refusedEvents).values({
      deviceId: installation.id,
      eventId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e12",
      deviceSeq: 2,
      aggregateType: "cash_session",
      aggregateId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e10",
      eventType: "cash_session_closed",
      schemaVersion: 1,
      payload: {},
      occurredAt: new Date("2026-01-05T12:00:00.000Z"),
      actorId: "0190f5a4-1b2c-7d3e-8f40-5a6b7c8d9e11",
      chainHmac: "forged-chain-hmac",
      refusedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(installationRequestAttempts).values({
      deviceId: installation.id,
      endpoint: "push",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(changes).values({
      entity: "branch_settings",
      entityId: await seededLocationId(db),
      version: 2,
      op: "update",
    });
    await db.insert(registerSnapshotKeys).values({
      registerId: register.id,
      version: 1,
      key: "sealed-snapshot-key",
    });
    await db.insert(registerContingencyTicketKeys).values({
      registerId: register.id,
      version: 1,
      key: "sealed-ticket-key",
    });
    await db.insert(registerEnrollmentAttempts).values({
      keyKind: "source_address",
      keyValue: "203.0.113.10",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(pinCodeRedemptionAttempts).values({
      keyKind: "register",
      keyValue: "a-register",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(signInLookupAttempts).values({
      registerId: register.id,
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(auditLog).values({ entity: "users", entityId: user.id });
    const [countMovement] = await db
      .insert(stockMovements)
      .values({
        productId: product.id,
        locationId: await seededLocationId(db),
        kind: "count",
        delta: 3000,
        occurredAt: new Date("2026-01-05T12:00:00.000Z"),
        actorId: user.id,
      })
      .returning({ id: stockMovements.id });
    if (!countMovement) {
      throw new Error("seeding stock movements returned no row");
    }
    await db
      .insert(stockCounts)
      .values({ movementId: countMovement.id, counted: 3000, expected: 0 });
    await db
      .insert(stockBalances)
      .values({ productId: product.id, locationId: await seededLocationId(db), quantity: 3000 });
    await db.insert(passkeys).values({
      userId: user.id,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Passkey",
    });
    await db.insert(userPins).values({
      userId: user.id,
      salt: "salt",
      hash: "hash",
      setAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(userPinCodes).values({
      userId: user.id,
      codeHash: "pin-code-hash",
      issuedBy: user.id,
      issuedAt: new Date("2026-01-05T12:00:00.000Z"),
      expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    });
    await db.insert(recoveryTokens).values({
      userId: user.id,
      tokenHash: "token-hash",
      expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    });
    await db.insert(recoveryRateLimitAttempts).values({
      keyKind: "source_address",
      keyValue: "203.0.113.10",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(recoveryRejectedAttemptAccumulator).values({
      kind: "request",
      keyHash: "key-hash",
      windowStart: new Date("2026-01-05T12:00:00.000Z"),
      firstAt: new Date("2026-01-05T12:00:00.000Z"),
      lastAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    const [session] = await db
      .insert(sessions)
      .values({ userId: user.id, sessionIdHash: "session-hash" })
      .returning({ id: sessions.id });
    if (!session) {
      throw new Error("seeding the session returned no row");
    }
    await db.insert(passkeyChallenges).values({
      sessionId: session.id,
      kind: "registration",
      registrationChallenge: "registration-challenge-1",
    });
    await db.insert(signInChallenges).values({ challenge: "challenge-1" });
    await db
      .insert(signInFailures)
      .values({ sourceAddress: "203.0.113.10", attemptedAt: new Date("2026-01-05T12:00:00.000Z") });
    await db.insert(signInLockouts).values({
      sourceAddress: "203.0.113.10",
      blockedUntil: new Date("2026-01-05T12:15:00.000Z"),
    });
    await db.insert(backofficeRateLimitAttempts).values({
      keyKind: "source_address",
      keyValue: "203.0.113.10",
      attemptedAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "user_email_changed",
        scope: "a-user-id",
        level: "warning",
        audience: "all",
        detail: {},
        openedAt: new Date("2026-01-05T12:00:00.000Z"),
      })
      .returning({ id: alerts.id });
    if (!alert) {
      throw new Error("seeding alerts returned no row");
    }
    await db.insert(alertDeliveries).values({
      alertId: alert.id,
      recipientUserId: user.id,
      channel: "backoffice",
      status: "sent",
    });
    await db
      .insert(arcaVitalityChecks)
      .values({ checkedAt: new Date("2026-01-05T12:00:00.000Z"), ok: true });
    await db.insert(arcaWsaaTokens).values({
      service: "wsfe",
      certificateFingerprint: "AB:CD:EF",
      token: "FICTIONAL-TOKEN-0001",
      sign: "FICTIONAL-SIGN-0001",
      issuedAt: new Date("2026-01-05T12:00:00.000Z"),
      expiresAt: new Date("2026-01-06T00:00:00.000Z"),
    });
    await db
      .insert(arcaInvoicingEvidence)
      .values({ lastCallOkAt: new Date("2026-01-05T12:00:00.000Z") });
    await db.insert(taxAuthorityLastAuthorizedNumbers).values({
      pointOfSaleNumber: 7,
      lastAuthorized: 41,
      readAt: new Date("2026-01-05T12:00:00.000Z"),
    });
    await db.insert(fiscalRequests).values({
      fiscalDocumentId: "00000000-0000-4000-8000-000000000101",
      registerId: register.id,
      saleId: "00000000-0000-4000-8000-000000000102",
      pointOfSale: 7,
      number: 42,
      issuedOn: "2026-01-05",
      total: 10_000,
      buyerTaxStatusCode: 5,
      saleEvent: { event_type: "sale_completed" },
      receivedAt: new Date("2026-01-05T12:00:00.000Z"),
      notAfter: new Date("2026-01-05T12:00:04.000Z"),
    });
    // issuer_identification is a true singleton: its row count can never grow, so its "seeded
    // before clear()" is a content change instead.
    await db.update(issuerIdentification).set({ legalName: "Temporary legal name" });
    await db
      .insert(buyerIdentificationThresholds)
      .values({ amount: 1_000_000, validFrom: "2026-10-01", recordedBy: user.id });
    await db.insert(buyerTaxStatusSets).values({
      paramsVersion: 1,
      options: [{ code: 901, description: "Condicion de prueba A", invoiceClass: "A" }],
    });
    await db.insert(issuerIdentificationVersions).values({ version: 2 });

    const afterSeeding = await countsByTable(client);
    for (const [tablename, count] of afterSeeding) {
      if (tablename === "issuer_identification") {
        continue;
      }
      expect(count, `table ${tablename} was not seeded before clear()`).toBeGreaterThan(
        baseline.get(tablename) ?? 0,
      );
    }
    expect(afterSeeding.get("issuer_identification")).toBe(1);

    await clear();

    expect(await countsByTable(client)).toEqual(baseline);
    const [restoredIssuerIdentification] = await db.select().from(issuerIdentification);
    expect(restoredIssuerIdentification).toMatchObject({ legalName: null });
  });

  it("removes a row on clear(), so its unique values can be inserted again", async () => {
    const { db, clear } = testDatabase;
    onTestFinished(clear);
    const locationId = await seededLocationId(db);
    await db.insert(users).values({ firstName: "Grace", email: "grace@example.com", locationId });

    await clear();

    const [user] = await db
      .insert(users)
      .values({ firstName: "Grace", email: "grace@example.com", locationId })
      .returning({ id: users.id });
    expect(user).toBeDefined();
  });

  it("restores seeded rows on clear() whatever order their tables reference each other in", async () => {
    const migrationsFolder = await migrationsFolderWith([
      'create table "seed_a" ("id" integer primary key, "b_id" integer)',
      'create table "seed_b" ("id" integer primary key, "a_id" integer not null references "seed_a" ("id"))',
      'alter table "seed_a" add foreign key ("b_id") references "seed_b" ("id")',
      'insert into "seed_a" ("id") values (1)',
      'insert into "seed_b" ("id", "a_id") values (1, 1)',
      'update "seed_a" set "b_id" = 1',
    ]);
    const ownDatabase = await buildTestDatabase({ migrationsFolder });
    onTestFinished(() => ownDatabase.close());

    await ownDatabase.clear();

    const { rows } = await ownDatabase.client.query(
      'select "seed_a"."b_id", "seed_b"."a_id" from "seed_a", "seed_b"',
    );
    expect(rows).toEqual([{ b_id: 1, a_id: 1 }]);
  });

  it("numbers a row inserted after clear() past the serial numbers of the rows it restored", async () => {
    const migrationsFolder = await migrationsFolderWith([
      'create table "seed_log" ("seq" bigserial primary key, "note" text not null)',
      `insert into "seed_log" ("note") values ('first'), ('second')`,
    ]);
    const ownDatabase = await buildTestDatabase({ migrationsFolder });
    onTestFinished(() => ownDatabase.close());

    await ownDatabase.clear();
    const { rows } = await ownDatabase.client.query<{ seq: number }>(
      `insert into "seed_log" ("note") values ('after clear') returning "seq"`,
    );

    expect(rows).toEqual([{ seq: 3 }]);
  });

  it("closes its database and rejects with the migration's own error when migrating fails", async () => {
    const migrationsFolder = await migrationsFolderWith(["select * from missing_table"]);
    const query = vi.spyOn(PGlite.prototype, "query");
    onTestFinished(() => query.mockRestore());

    const attempt = buildTestDatabase({ migrationsFolder }).then((database) => {
      onTestFinished(() => database.close());
      return database;
    });
    await expect(attempt).rejects.toThrow(/missing_table/);

    const queried = new Set(query.mock.contexts);
    expect(queried.size).toBeGreaterThan(0);
    for (const database of queried) {
      expect(database).toHaveProperty("closed", true);
    }
  });

  it("rejects with the migration's own error even when closing its database also fails", async () => {
    const migrationsFolder = await migrationsFolderWith(["select * from missing_table"]);
    // PGlite closes a throwaway instance of its own on startup; only the database the migration
    // queried is made to fail on close.
    const query = vi.spyOn(PGlite.prototype, "query");
    onTestFinished(() => query.mockRestore());
    const realClose = PGlite.prototype.close;
    const close = vi.spyOn(PGlite.prototype, "close").mockImplementation(async function (
      this: PGlite,
    ) {
      await realClose.call(this);
      if (query.mock.contexts.includes(this)) {
        throw new Error("close failed");
      }
    });
    onTestFinished(() => close.mockRestore());

    const attempt = buildTestDatabase({ migrationsFolder }).then((database) => {
      onTestFinished(() => database.close());
      return database;
    });
    await expect(attempt).rejects.toThrow(/missing_table/);
    expect(query.mock.contexts.some((database) => close.mock.contexts.includes(database))).toBe(
      true,
    );
  });

  it("starts from the snapshot this test run provides, without migrating again, when given no arguments", async () => {
    expect(
      inject("testDatabaseSnapshotPath"),
      "the node project's global setup provided no database snapshot",
    ).toBeDefined();
    vi.mocked(migrateFreshDatabase).mockClear();

    const database = await buildTestDatabase();
    onTestFinished(() => database.close());

    expect(migrateFreshDatabase).not.toHaveBeenCalled();
    const { rows } = await database.client.query<{ name: string }>(
      'select "name" from "roles" where "is_administrator"',
    );
    expect(rows).toHaveLength(1);
  });

  it("starts from a provided snapshot instead of migrating, when the default migrations folder is used", async () => {
    const snapshotPath = await snapshotPathWithMarkerRole();

    const database = await buildTestDatabase({ snapshotPath });
    onTestFinished(() => database.close());

    const { rows } = await database.client.query<{ name: string | null }>(
      'select "name" from "roles" where "name" = $1',
      ["marker-role"],
    );
    expect(rows).toHaveLength(1);
  });

  it("ignores a snapshot path when a custom migrations folder is given, since the snapshot only matches the default migrations", async () => {
    const snapshotPath = await snapshotPathWithMarkerRole();
    const migrationsFolder = await migrationsFolderWith([
      'create table "only_here" ("id" integer primary key)',
    ]);

    vi.mocked(migrateFreshDatabase).mockClear();

    const database = await buildTestDatabase({ migrationsFolder, snapshotPath });
    onTestFinished(() => database.close());

    expect(migrateFreshDatabase).toHaveBeenCalledWith(
      migrationsFolder,
      inject("testDatabaseClusterDumpPath"),
    );
    const { rows } = await database.client.query('select * from "only_here"');
    expect(rows).toEqual([]);
  });

  it("starts a custom migrations folder from the given cluster dump instead of running initdb", async () => {
    const clusterDumpPath = await clusterDumpPathWithMarkerTable();
    const migrationsFolder = await migrationsFolderWith([
      'create table "only_here" ("id" integer primary key)',
    ]);

    const database = await buildTestDatabase({ migrationsFolder, clusterDumpPath });
    onTestFinished(() => database.close());

    const { rows } = await database.client.query('select "id" from "cluster_dump_marker"');
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("injects the empty cluster dump the node project's global setup provided, for a custom migrations folder", async () => {
    expect(
      inject("testDatabaseClusterDumpPath"),
      "the node project's global setup provided no cluster dump",
    ).toBeDefined();
  });
});
