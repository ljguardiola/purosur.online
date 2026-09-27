import { eq, inArray, like, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  alertDeliveries,
  alerts,
  auditLog,
  branchHours,
  branchSettings,
  categories,
  locations,
  passkeys,
  priceReviews,
  prices,
  productBarcodes,
  products,
  registerEnrollmentCodes,
  registers,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { hashSourceAddress } from "../session/sign-in-lockout.js";
import {
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_INFORMATIONAL_ALERT_KIND,
  SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  sampleCategoryNames,
} from "./sample-catalog.js";

// The schema's own column defaults (branch-settings.ts), reapplied directly since there is no
// domain function that resets a branch's settings back to an unconfigured state.
const BRANCH_SETTINGS_DEFAULTS = {
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
};

export interface ClearSampleDataSummary {
  users: number;
  roles: number;
  categories: number;
  products: number;
  registers: number;
  alerts: number;
}

export type ClearSampleDataOutcome =
  | { kind: "not_loaded" }
  | { kind: "cleared"; summary: ClearSampleDataSummary };

export async function clearSampleData<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<ClearSampleDataOutcome> {
  return db.transaction<ClearSampleDataOutcome>(async (tx) => {
    const sampleUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%@${SAMPLE_EMAIL_DOMAIN}`));
    if (sampleUsers.length === 0) {
      return { kind: "not_loaded" };
    }
    const sampleUserIds = sampleUsers.map((row) => row.id);

    const [location] = await tx.select({ id: locations.id }).from(locations).limit(1);
    if (!location) {
      throw new Error("sample-data: no location is seeded in the database");
    }

    const categoryNames = sampleCategoryNames();
    const sampleLeafCategories = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.name, [...categoryNames.leaf]));
    const sampleLeafCategoryIds = sampleLeafCategories.map((row) => row.id);

    const sampleProducts = await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.categoryId, sampleLeafCategoryIds));
    const sampleProductIds = sampleProducts.map((row) => row.id);

    // A closed source-address alert has its scope replaced by its hash (alert-close-route.ts), so
    // both forms are matched here to still find one after it's been closed.
    const sampleLockoutScopes = [
      SAMPLE_LOCKOUT_SOURCE_ADDRESSES.keptOpen,
      SAMPLE_LOCKOUT_SOURCE_ADDRESSES.closed,
      hashSourceAddress(SAMPLE_LOCKOUT_SOURCE_ADDRESSES.keptOpen),
      hashSourceAddress(SAMPLE_LOCKOUT_SOURCE_ADDRESSES.closed),
    ];
    const sampleAlerts = await tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        or(
          inArray(alerts.scope, sampleUserIds),
          inArray(alerts.scope, sampleLockoutScopes),
          eq(alerts.kind, SAMPLE_INFORMATIONAL_ALERT_KIND),
        ),
      );
    const sampleAlertIds = sampleAlerts.map((row) => row.id);

    const sampleRoles = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        inArray(
          roles.name,
          SAMPLE_ROLES.map((role) => role.name),
        ),
      );
    const sampleRoleIds = sampleRoles.map((row) => row.id);

    const sampleRegisters = await tx
      .select({ id: registers.id })
      .from(registers)
      .where(inArray(registers.name, [...SAMPLE_REGISTER_NAMES]));
    const sampleRegisterIds = sampleRegisters.map((row) => row.id);

    await tx
      .delete(alertDeliveries)
      .where(
        or(
          inArray(alertDeliveries.alertId, sampleAlertIds),
          inArray(alertDeliveries.recipientUserId, sampleUserIds),
        ),
      );
    await tx.delete(alerts).where(inArray(alerts.id, sampleAlertIds));

    await tx.delete(priceReviews).where(inArray(priceReviews.productId, sampleProductIds));
    await tx.delete(prices).where(inArray(prices.productId, sampleProductIds));
    await tx.delete(productBarcodes).where(inArray(productBarcodes.productId, sampleProductIds));
    // The delete-rejection trigger (migration 0026) only ever expects a live product to be
    // deactivated, never removed; disabling it is transactional and reverts automatically on commit.
    await tx.execute(sql`alter table products disable trigger products_reject_deletion`);
    await tx.delete(products).where(inArray(products.id, sampleProductIds));
    await tx.execute(sql`alter table products enable trigger products_reject_deletion`);

    await tx.delete(categories).where(inArray(categories.name, [...categoryNames.leaf]));
    await tx.delete(categories).where(inArray(categories.name, [...categoryNames.mid]));
    await tx.delete(categories).where(inArray(categories.name, [...categoryNames.top]));

    const sampleEntityIds = [
      ...sampleUserIds,
      ...sampleRoleIds,
      ...sampleRegisterIds,
      ...sampleProductIds,
    ];
    await tx
      .delete(auditLog)
      .where(
        or(inArray(auditLog.actorId, sampleUserIds), inArray(auditLog.entityId, sampleEntityIds)),
      );

    await tx.delete(sessions).where(inArray(sessions.userId, sampleUserIds));
    await tx.delete(passkeys).where(inArray(passkeys.userId, sampleUserIds));
    await tx.delete(userRoles).where(inArray(userRoles.userId, sampleUserIds));
    await tx.delete(users).where(inArray(users.id, sampleUserIds));

    await tx.delete(rolePermissions).where(inArray(rolePermissions.roleId, sampleRoleIds));
    await tx.delete(roles).where(inArray(roles.id, sampleRoleIds));

    await tx
      .delete(registerEnrollmentCodes)
      .where(inArray(registerEnrollmentCodes.registerId, sampleRegisterIds));
    await tx.delete(registers).where(inArray(registers.id, sampleRegisterIds));

    await tx
      .update(branchSettings)
      .set({ ...BRANCH_SETTINGS_DEFAULTS, version: sql`${branchSettings.version} + 1` })
      .where(eq(branchSettings.locationId, location.id));
    await tx.delete(branchHours).where(eq(branchHours.locationId, location.id));

    return {
      kind: "cleared",
      summary: {
        users: sampleUserIds.length,
        roles: sampleRoleIds.length,
        categories: categoryNames.top.length + categoryNames.mid.length + categoryNames.leaf.length,
        products: sampleProductIds.length,
        registers: sampleRegisterIds.length,
        alerts: sampleAlertIds.length,
      },
    };
  });
}
