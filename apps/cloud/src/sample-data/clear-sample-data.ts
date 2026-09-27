import { and, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  alertDeliveries,
  alerts,
  auditLog,
  branchHours,
  branchSettings,
  categories,
  locations,
  passkeyChallenges,
  passkeys,
  priceReviews,
  prices,
  productBarcodes,
  products,
  recoveryTokens,
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
  BRANCH_SETTINGS_DEFAULTS,
  branchSettingsEqualSampleValues,
} from "./sample-branch-settings.js";
import {
  SAMPLE_CATEGORY_TREE,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_INFORMATIONAL_ALERT_KIND,
  SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
} from "./sample-catalog.js";

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
  | { kind: "refused"; detail: string }
  | { kind: "cleared"; summary: ClearSampleDataSummary };

class SampleDataClearRefusal extends Error {}

const FOREIGN_KEY_VIOLATION = "23503";

// postgres-js names the field `constraint_name`; PGlite names it `constraint`.
function foreignKeyViolationConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    if (code === FOREIGN_KEY_VIOLATION) {
      const name = constraint_name ?? constraint;
      return typeof name === "string" ? name : "unknown constraint";
    }
    current = current.cause;
  }
  return undefined;
}

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

interface SampleCatalogRows {
  categoryIdsByDepth: { top: string[]; mid: string[]; leaf: string[] };
  productIds: string[];
}

async function findSampleCatalogRows<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
): Promise<SampleCatalogRows> {
  const sampleNames = new Set<string>();
  for (const top of SAMPLE_CATEGORY_TREE) {
    sampleNames.add(top.name);
    for (const mid of top.mids) {
      sampleNames.add(mid.name);
      for (const leaf of mid.leaves) {
        sampleNames.add(leaf.name);
      }
    }
  }
  const candidates = await tx
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(inArray(categories.name, [...sampleNames]));
  const findCategory = (name: string, parentId: string | null): string | undefined =>
    candidates.find((row) => row.name === name && row.parentId === parentId)?.id;

  const categoryIdsByDepth = { top: [] as string[], mid: [] as string[], leaf: [] as string[] };
  const plannedProductNamesByLeafId = new Map<string, string[]>();
  for (const top of SAMPLE_CATEGORY_TREE) {
    const topId = findCategory(top.name, null);
    if (!topId) continue;
    categoryIdsByDepth.top.push(topId);
    for (const mid of top.mids) {
      const midId = findCategory(mid.name, topId);
      if (!midId) continue;
      categoryIdsByDepth.mid.push(midId);
      for (const leaf of mid.leaves) {
        const leafId = findCategory(leaf.name, midId);
        if (!leafId) continue;
        categoryIdsByDepth.leaf.push(leafId);
        plannedProductNamesByLeafId.set(
          leafId,
          leaf.products.map((product) => product.name),
        );
      }
    }
  }
  const sampleCategoryIds = [
    ...categoryIdsByDepth.top,
    ...categoryIdsByDepth.mid,
    ...categoryIdsByDepth.leaf,
  ];

  const [foreignChild] = await tx
    .select({ name: categories.name })
    .from(categories)
    .where(
      and(
        inArray(categories.parentId, sampleCategoryIds),
        notInArray(categories.id, sampleCategoryIds),
      ),
    )
    .limit(1);
  if (foreignChild) {
    throw new SampleDataClearRefusal(
      `category "${foreignChild.name}" is not sample data but sits inside a sample category`,
    );
  }

  const productsInSampleLeaves = await tx
    .select({ id: products.id, name: products.name, categoryId: products.categoryId })
    .from(products)
    .where(inArray(products.categoryId, categoryIdsByDepth.leaf));
  const remainingPlannedNames = new Map(
    [...plannedProductNamesByLeafId].map(([leafId, names]) => [leafId, [...names]]),
  );
  const productIds: string[] = [];
  for (const product of productsInSampleLeaves) {
    const remaining = remainingPlannedNames.get(product.categoryId) ?? [];
    const plannedIndex = remaining.indexOf(product.name);
    if (plannedIndex === -1) {
      throw new SampleDataClearRefusal(
        `product "${product.name}" is not sample data but sits inside a sample category`,
      );
    }
    remaining.splice(plannedIndex, 1);
    productIds.push(product.id);
  }

  return { categoryIdsByDepth, productIds };
}

export async function clearSampleData<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<ClearSampleDataOutcome> {
  try {
    return await clearSampleDataInTransaction(db);
  } catch (error) {
    if (error instanceof SampleDataClearRefusal) {
      return { kind: "refused", detail: error.message };
    }
    const violatedConstraint = foreignKeyViolationConstraint(error);
    if (violatedConstraint !== undefined) {
      return {
        kind: "refused",
        detail: `data that is not sample data still references sample data (${violatedConstraint})`,
      };
    }
    throw error;
  }
}

async function clearSampleDataInTransaction<TQueryResult extends PgQueryResultHKT>(
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

    const [remainingAdministrator] = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(roles.isAdministrator, true),
          eq(users.active, true),
          notInArray(users.id, sampleUserIds),
        ),
      )
      .limit(1);
    if (!remainingAdministrator) {
      throw new SampleDataClearRefusal("clearing would leave no active Administrator");
    }

    const [location] = await tx.select({ id: locations.id }).from(locations).limit(1);
    if (!location) {
      throw new Error("sample-data: no location is seeded in the database");
    }

    const { categoryIdsByDepth, productIds: sampleProductIds } = await findSampleCatalogRows(tx);

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

    const sampleSessionIds = (
      await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(inArray(sessions.userId, sampleUserIds))
    ).map((row) => row.id);
    const samplePasskeyIds = (
      await tx
        .select({ id: passkeys.id })
        .from(passkeys)
        .where(inArray(passkeys.userId, sampleUserIds))
    ).map((row) => row.id);
    const sampleRecoveryTokenIds = (
      await tx
        .select({ id: recoveryTokens.id })
        .from(recoveryTokens)
        .where(inArray(recoveryTokens.userId, sampleUserIds))
    ).map((row) => row.id);

    await tx
      .delete(alertDeliveries)
      .where(
        or(
          inArray(alertDeliveries.alertId, sampleAlertIds),
          inArray(alertDeliveries.recipientUserId, sampleUserIds),
        ),
      );
    const deletedAlerts = await tx
      .delete(alerts)
      .where(inArray(alerts.id, sampleAlertIds))
      .returning({ id: alerts.id });

    await tx.delete(priceReviews).where(inArray(priceReviews.productId, sampleProductIds));
    await tx.delete(prices).where(inArray(prices.productId, sampleProductIds));
    await tx.delete(productBarcodes).where(inArray(productBarcodes.productId, sampleProductIds));
    // The delete-rejection trigger (migration 0026) only ever expects a live product to be
    // deactivated, never removed; disabling it is transactional and reverts automatically on commit.
    await tx.execute(sql`alter table products disable trigger products_reject_deletion`);
    const deletedProducts = await tx
      .delete(products)
      .where(inArray(products.id, sampleProductIds))
      .returning({ id: products.id });
    await tx.execute(sql`alter table products enable trigger products_reject_deletion`);

    let deletedCategoryCount = 0;
    for (const depthIds of [
      categoryIdsByDepth.leaf,
      categoryIdsByDepth.mid,
      categoryIdsByDepth.top,
    ]) {
      const deleted = await tx
        .delete(categories)
        .where(inArray(categories.id, depthIds))
        .returning({ id: categories.id });
      deletedCategoryCount += deleted.length;
    }

    const sampleEntityIds = [
      ...sampleUserIds,
      ...sampleRoleIds,
      ...sampleRegisterIds,
      ...sampleProductIds,
      ...sampleAlertIds,
      ...samplePasskeyIds,
      ...sampleRecoveryTokenIds,
    ];
    await tx
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.entityId, sampleEntityIds),
          and(eq(auditLog.entity, "branch_settings"), inArray(auditLog.actorId, sampleUserIds)),
        ),
      );

    await tx
      .delete(passkeyChallenges)
      .where(inArray(passkeyChallenges.sessionId, sampleSessionIds));
    await tx.delete(sessions).where(inArray(sessions.id, sampleSessionIds));
    await tx.delete(passkeys).where(inArray(passkeys.id, samplePasskeyIds));
    await tx.delete(recoveryTokens).where(inArray(recoveryTokens.id, sampleRecoveryTokenIds));
    await tx.delete(userRoles).where(inArray(userRoles.userId, sampleUserIds));
    const deletedUsers = await tx
      .delete(users)
      .where(inArray(users.id, sampleUserIds))
      .returning({ id: users.id });

    await tx.delete(rolePermissions).where(inArray(rolePermissions.roleId, sampleRoleIds));
    const deletedRoles = await tx
      .delete(roles)
      .where(inArray(roles.id, sampleRoleIds))
      .returning({ id: roles.id });

    await tx
      .delete(registerEnrollmentCodes)
      .where(inArray(registerEnrollmentCodes.registerId, sampleRegisterIds));
    const deletedRegisters = await tx
      .delete(registers)
      .where(inArray(registers.id, sampleRegisterIds))
      .returning({ id: registers.id });

    if (await branchSettingsEqualSampleValues(tx, location.id)) {
      await tx
        .update(branchSettings)
        .set({ ...BRANCH_SETTINGS_DEFAULTS, version: sql`${branchSettings.version} + 1` })
        .where(eq(branchSettings.locationId, location.id));
      await tx.delete(branchHours).where(eq(branchHours.locationId, location.id));
    }

    return {
      kind: "cleared",
      summary: {
        users: deletedUsers.length,
        roles: deletedRoles.length,
        categories: deletedCategoryCount,
        products: deletedProducts.length,
        registers: deletedRegisters.length,
        alerts: deletedAlerts.length,
      },
    };
  });
}
