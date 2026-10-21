import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { DrizzleOfflineAuthorizationCodeStore } from "../fiscal/drizzle-offline-authorization-code-store.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import { configureOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { insertRejectedDocumentRemedy } from "../fiscal/test-support/rejected-document-remedy-fixtures.js";
import {
  alerts,
  branchHours,
  categories,
  deviceState,
  fortnightDocumentReports,
  locations,
  lots,
  products,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { setUpRecovery } from "../server.js";
import { insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2020-01-05T12:00:00.000Z");
const STABLE_CLEAR_MS = 11 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_condition_resolution_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the background worker the server sets up on a real Postgres", () => {
  it("runs the alert condition resolution job by the clock it is handed, resolving only the alerts whose condition stayed cleared", async () => {
    const [stable, recent, holding] = await db
      .insert(alerts)
      .values(
        [
          ["register-stable", new Date(NOW.getTime() - 11 * MINUTE_MS)],
          ["register-recent", new Date(NOW.getTime() - 9 * MINUTE_MS)],
          ["register-holding", null],
        ].map(([scope, conditionClearedAt]) => ({
          kind: "update_required",
          scope: scope as string,
          level: "critical" as const,
          audience: "all" as const,
          detail: { deviceId: "device-1", appVersion: "0.9.0" },
          openedAt: new Date(NOW.getTime() - 60 * MINUTE_MS),
          conditionClearedAt: conditionClearedAt as Date | null,
        })),
      )
      .returning({ id: alerts.id });
    if (!stable || !recent || !holding) {
      throw new Error("test setup: inserting the alerts returned no rows");
    }
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;

      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.id, stable.id));
          expect(row?.resolvedAt).toEqual(NOW);
        },
        { timeout: 20_000, interval: 100 },
      );
      const [notYet] = await db.select().from(alerts).where(eq(alerts.id, recent.id));
      const [stillHolding] = await db.select().from(alerts).where(eq(alerts.id, holding.id));
      expect(notYet?.resolvedAt).toBeNull();
      expect(stillHolding?.resolvedAt).toBeNull();
    } finally {
      await recovery.close();
    }
  }, 60_000);

  it("opens the alert of a register known to report on every sync cycle that went quiet during the branch's business hours", async () => {
    const quiet = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(branchHours).values({
      locationId: quiet.locationId,
      dayOfWeek: 7,
      position: 0,
      opensAt: "08:00",
      closesAt: "12:00",
    });
    await db.insert(deviceState).values({
      deviceId: quiet.deviceId,
      lastAcceptedPushAt: new Date(NOW.getTime() - 20 * MINUTE_MS),
      reportsEveryCycleSince: new Date(NOW.getTime() - 60 * MINUTE_MS),
    });
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;

      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.scope, quiet.registerId));
          expect(row).toMatchObject({
            kind: "register_silent",
            level: "critical",
            audience: "local",
            locationId: quiet.locationId,
            resolvedAt: null,
          });
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 60_000);

  it("opens the alert of a register with an offline point of sale that has not downloaded the current fortnight's code", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja fiscal",
      realTimePointOfSale: 2,
      offlinePointOfSale: 3,
      now: NOW,
    });
    const installation = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;

      await vi.waitFor(
        async () => {
          const [row] = await db
            .select()
            .from(alerts)
            .where(eq(alerts.scope, `${registerId}:2020-01-01`));
          expect(row).toMatchObject({
            kind: "offline_authorization_code_missing",
            level: "critical",
            audience: "all",
            locationId: null,
            resolvedAt: null,
            detail: {
              deviceId: installation.deviceId,
              fortnightStart: "2020-01-01",
              fortnightEnd: "2020-01-15",
            },
          });
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 60_000);

  it("keeps an informational alert open for a branch with a lot inside its expiry window, then resolves it once the lot is gone and the condition stayed cleared", async () => {
    const [location] = await db.select({ id: locations.id }).from(locations).limit(1);
    if (!location) {
      throw new Error("test setup: no location seeded");
    }
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada-lots@example.com", locationId: location.id })
      .returning({ id: users.id });
    const [category] = await db
      .insert(categories)
      .values({ name: "Frutos secos" })
      .returning({ id: categories.id });
    if (!actor || !category) {
      throw new Error("test setup: seeding the user and category returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Almendras", categoryId: category.id, saleUnit: "KG" })
      .returning({ id: products.id });
    if (!product) {
      throw new Error("test setup: seeding the product returned no row");
    }
    const lotId = await insertPurchasedLot(db, {
      productId: product.id,
      locationId: location.id,
      actorId: actor.id,
      purchasedOn: "2019-12-20",
      expiresOn: "2020-01-20",
    });
    let currentTime = NOW;
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => currentTime,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.scope, location.id));
          expect(row).toMatchObject({
            kind: "lots_expiring",
            level: "informational",
            audience: "local",
            locationId: location.id,
            detail: { lotCount: 1, windowDays: 30 },
            resolvedAt: null,
            conditionClearedAt: null,
          });
        },
        { timeout: 20_000, interval: 100 },
      );

      await db.update(lots).set({ remaining: 0 }).where(eq(lots.id, lotId));
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.scope, location.id));
          expect(row).toMatchObject({ conditionClearedAt: NOW, resolvedAt: null });
        },
        { timeout: 20_000, interval: 100 },
      );

      currentTime = new Date(NOW.getTime() + STABLE_CLEAR_MS);
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.scope, location.id));
          expect(row?.resolvedAt).toEqual(currentTime);
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("keeps the notice of an owed fortnight report open with the days left, then replaces it by a permanent overdue alert once the deadline is missed", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja de quincenas",
      realTimePointOfSale: 5,
      offlinePointOfSale: 6,
      now: NOW,
    });
    const admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
    try {
      await admin`update point_of_sale_claims set claimed_at = ${"2019-12-10T12:00:00.000Z"}::timestamptz where point_of_sale_number = 6`;
    } finally {
      await admin.end({ timeout: 1 });
    }
    const fortnight = { start: "2019-12-16", end: "2019-12-31" };
    await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
      acquisition.keep({
        code: { code: "36123456789099", fortnight, reportDeadline: "2020-01-20" },
        obtainedAt: new Date("2019-12-10T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
    );
    let currentTime = NOW;
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => currentTime,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );
    const scope = "6:2019-12-16";
    const presentation = {
      pointOfSaleNumber: 6,
      registerId,
      fortnightStart: "2019-12-16",
      fortnightEnd: "2019-12-31",
      deadline: "2020-01-08",
    };

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const rows = await db.select().from(alerts).where(eq(alerts.scope, scope));
          expect(rows).toMatchObject([
            {
              kind: "fortnight_report_pending",
              level: "warning",
              audience: "all",
              resolvedAt: null,
              conditionClearedAt: null,
              detail: { ...presentation, daysLeft: 3, reason: "pending" },
            },
          ]);
        },
        { timeout: 20_000, interval: 100 },
      );

      currentTime = new Date("2020-01-09T12:00:00.000Z");
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const rows = await db.select().from(alerts).where(eq(alerts.scope, scope));
          expect(rows.map(({ kind }) => kind).sort()).toEqual([
            "fortnight_report_overdue",
            "fortnight_report_pending",
          ]);
          expect(rows.find(({ kind }) => kind === "fortnight_report_overdue")).toMatchObject({
            level: "critical",
            audience: "all",
            resolvedAt: null,
            detail: presentation,
          });
          expect(
            rows.find(({ kind }) => kind === "fortnight_report_pending")?.conditionClearedAt,
          ).toEqual(currentTime);
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("keeps the alert of a presentation with a rejected document open until its remedy is recorded, then clears it", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja con rechazo",
      realTimePointOfSale: 15,
      offlinePointOfSale: 16,
      now: NOW,
    });
    const fortnight = { start: "2019-12-16", end: "2019-12-31" };
    await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
      acquisition.keep({
        code: { code: "36123456789098", fortnight, reportDeadline: "2020-01-20" },
        obtainedAt: new Date("2019-12-10T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
    );
    await db.insert(fortnightDocumentReports).values({
      pointOfSaleNumber: 16,
      fortnightStart: fortnight.start,
      fortnightEnd: fortnight.end,
      documentType: "factura_c",
      state: "refused",
      reportedThrough: 2,
      rejectedNumber: 3,
      rejections: [{ code: 10016, message: "Fictional observation" }],
      lastAttemptAt: new Date("2020-01-03T12:00:00.000Z"),
      recordedAt: new Date("2020-01-03T12:00:00.000Z"),
    });
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );
    const scope = "16:2019-12-16:factura_c";

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const rows = await db.select().from(alerts).where(eq(alerts.scope, scope));
          expect(rows).toMatchObject([
            {
              kind: "fortnight_report_document_rejected",
              level: "critical",
              audience: "all",
              resolvedAt: null,
              conditionClearedAt: null,
              detail: {
                pointOfSaleNumber: 16,
                registerId,
                fortnightStart: "2019-12-16",
                fortnightEnd: "2019-12-31",
                documentType: "factura_c",
                rejectedNumber: 3,
              },
            },
          ]);
        },
        { timeout: 20_000, interval: 100 },
      );

      await insertRejectedDocumentRemedy(db, {
        pointOfSale: 16,
        fortnight,
        number: 3,
        correction: null,
        recordedAt: new Date("2020-01-04T12:00:00.000Z"),
      });
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;
      await vi.waitFor(
        async () => {
          const rows = await db.select().from(alerts).where(eq(alerts.scope, scope));
          expect(rows[0]?.conditionClearedAt).toEqual(NOW);
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("opens the alert of a register whose changes have gone more than an hour without a verified generation", async () => {
    const overdue = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja sin respaldo",
    });
    const firstChange = new Date(NOW.getTime() - 90 * MINUTE_MS);
    await insertInboxEvent(db, overdue.deviceId, { occurredAt: firstChange });
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
    );

    try {
      await sql`select graphile_worker.add_job('alert-condition-resolution')`;

      await vi.waitFor(
        async () => {
          const [row] = await db.select().from(alerts).where(eq(alerts.scope, overdue.registerId));
          expect(row).toMatchObject({
            kind: "register_backup_overdue",
            level: "critical",
            audience: "all",
            resolvedAt: null,
            detail: {
              lastVerifiedGenerationAt: null,
              firstChangeAt: firstChange.toISOString(),
            },
          });
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
