import { and, eq, like, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { createRole } from "../access/role-creation-route.js";
import { SIGN_IN_BLOCK_DURATION_MS, SIGN_IN_FAILURE_LIMIT } from "../access/sign-in-lockout.js";
import { createUser } from "../access/user-creation-route.js";
import { deactivateUser } from "../access/user-deactivation-route.js";
import { closeAlert } from "../alerts/alert-close-route.js";
import { escalateOverdueAlerts } from "../alerts/alert-escalation.js";
import { openAlert } from "../alerts/open-alert.js";
import { editBranchSettings } from "../branch/branch-settings-edit-route.js";
import { createCategory } from "../catalog/category-creation-route.js";
import { allocateInternalBarcode } from "../catalog/internal-barcode-route.js";
import { createProduct } from "../catalog/product-creation-route.js";
import { deactivateProduct } from "../catalog/product-deactivation-route.js";
import { branchSettings, locations, roles, userRoles, users } from "../platform/db/schema.js";
import { branchPriceListId } from "../pricing/branch-price-list.js";
import { confirmPrice } from "../pricing/price-confirmation-route.js";
import { setPrice } from "../pricing/price-set-route.js";
import { createRegister } from "../register/register-creation-route.js";
import { branchSettingsAreAtDefaults } from "./sample-branch-settings.js";
import {
  SAMPLE_ADMINISTRATOR,
  SAMPLE_BRANCH_SETTINGS,
  SAMPLE_CATEGORY_TREE,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  sampleEmail,
} from "./sample-catalog.js";

// Scoped to this database (advisory locks are per-connection-database, never cluster-wide), so a
// concurrent `load-sample-data` run waits for this one instead of racing its sentinel check.
const SAMPLE_DATA_ADVISORY_LOCK_KEY = 875_320;

const OVERDUE_PRICE_REVIEW_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const ESCALATION_ELIGIBLE_ALERT_AGE_MS = 25 * 60 * 60 * 1000;

class SampleDataCollisionError extends Error {}

function expectOutcome<TOutcome extends { kind: string }, TKind extends TOutcome["kind"]>(
  outcome: TOutcome,
  kind: TKind,
  label: string,
): Extract<TOutcome, { kind: TKind }> {
  if (outcome.kind !== kind) {
    throw new SampleDataCollisionError(
      `sample-data: ${label} did not result in "${kind}" (got "${outcome.kind}")`,
    );
  }
  return outcome as Extract<TOutcome, { kind: TKind }>;
}

interface LoadSampleDataSummary {
  categories: number;
  products: number;
  roles: number;
  users: number;
  registers: number;
}

export type LoadSampleDataOutcome =
  | { kind: "already_loaded" }
  | { kind: "no_administrator" }
  | { kind: "collision"; detail: string }
  | { kind: "loaded"; summary: LoadSampleDataSummary };

export interface LoadSampleDataDeps {
  now: () => Date;
}

export async function loadSampleData<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: LoadSampleDataDeps,
): Promise<LoadSampleDataOutcome> {
  try {
    return await db.transaction<LoadSampleDataOutcome>(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SAMPLE_DATA_ADVISORY_LOCK_KEY})`);

      const [sentinel] = await tx
        .select({ id: users.id })
        .from(users)
        .where(like(users.email, `%@${SAMPLE_EMAIL_DOMAIN}`))
        .limit(1);
      if (sentinel) {
        return { kind: "already_loaded" };
      }

      const [bootstrapAdministrator] = await tx
        .select({ id: users.id, roleId: roles.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(roles.isAdministrator, true), eq(users.active, true)))
        .limit(1);
      if (!bootstrapAdministrator) {
        return { kind: "no_administrator" };
      }

      const [location] = await tx.select({ id: locations.id }).from(locations).limit(1);
      if (!location) {
        throw new Error("sample-data: no location is seeded in the database");
      }

      const administratorOutcome = await createUser(tx, {
        firstName: SAMPLE_ADMINISTRATOR.firstName,
        email: SAMPLE_ADMINISTRATOR.email,
        roleId: bootstrapAdministrator.roleId,
        locationId: location.id,
        actorId: bootstrapAdministrator.id,
      });
      const sampleAdministrator = expectOutcome(
        administratorOutcome,
        "created",
        "the sample administrator user",
      );
      const actorId = sampleAdministrator.id;

      const roleIdByName = new Map<string, string>();
      for (const rolePlan of SAMPLE_ROLES) {
        const outcome = await createRole(tx, {
          name: rolePlan.name,
          permissionKeys: [...rolePlan.permissionKeys],
          actorId,
        });
        const created = expectOutcome(outcome, "created", `role "${rolePlan.name}"`);
        roleIdByName.set(rolePlan.name, created.role.id);
      }

      const sampleUserIdsInOrder: string[] = [];
      for (const rolePlan of SAMPLE_ROLES) {
        const roleId = roleIdByName.get(rolePlan.name);
        if (!roleId) {
          throw new Error(`sample-data: role "${rolePlan.name}" was not created`);
        }
        for (const userPlan of rolePlan.users) {
          const outcome = await createUser(tx, {
            firstName: userPlan.firstName,
            email: userPlan.email,
            roleId,
            locationId: location.id,
            actorId,
          });
          const created = expectOutcome(outcome, "created", `user "${userPlan.firstName}"`);
          sampleUserIdsInOrder.push(created.id);
          if (!userPlan.active) {
            const deactivated = await deactivateUser(tx, {
              id: created.id,
              actorId,
              at: deps.now(),
            });
            expectOutcome(deactivated, "deactivated", `deactivating user "${userPlan.firstName}"`);
          }
        }
      }

      const priceListId = await branchPriceListId(tx, location.id);
      const recentMoment = deps.now();
      const overdueReviewMoment = new Date(recentMoment.getTime() - OVERDUE_PRICE_REVIEW_AGE_MS);

      let categoryCount = 0;
      let productCount = 0;
      for (const top of SAMPLE_CATEGORY_TREE) {
        const topOutcome = await createCategory(tx, { name: top.name, parentId: null });
        const topCategory = expectOutcome(topOutcome, "created", `category "${top.name}"`);
        categoryCount += 1;

        for (const mid of top.mids) {
          const midOutcome = await createCategory(tx, {
            name: mid.name,
            parentId: topCategory.category.id,
          });
          const midCategory = expectOutcome(midOutcome, "created", `category "${mid.name}"`);
          categoryCount += 1;

          for (const leaf of mid.leaves) {
            const leafOutcome = await createCategory(tx, {
              name: leaf.name,
              parentId: midCategory.category.id,
            });
            const leafCategory = expectOutcome(leafOutcome, "created", `category "${leaf.name}"`);
            categoryCount += 1;

            for (const plan of leaf.products) {
              const barcode =
                plan.barcode.kind === "manufacturer"
                  ? plan.barcode.code
                  : await allocateInternalBarcode(tx);
              const productOutcome = await createProduct(tx, {
                name: plan.name,
                categoryId: leafCategory.category.id,
                saleUnit: plan.saleUnit,
                barcodes: [barcode],
                netContent: plan.netContent,
              });
              const product = expectOutcome(productOutcome, "created", `product "${plan.name}"`);
              productCount += 1;

              // Priced while still active: `setPrice`/`confirmPrice` only ever act on an active
              // product, so an inactive sample product is priced first and deactivated last.
              if (plan.pricePlan === "current") {
                const setOutcome = await setPrice(tx, {
                  productId: product.product.id,
                  priceListId,
                  unitPrice: plan.unitPriceCents,
                  expectedCurrentPriceId: null,
                  actorId,
                  now: () => recentMoment,
                });
                const applied = expectOutcome(setOutcome, "applied", `pricing "${plan.name}"`);
                const confirmOutcome = await confirmPrice(tx, {
                  productId: product.product.id,
                  priceListId,
                  expectedCurrentPriceId: applied.price.id,
                  actorId,
                  now: () => recentMoment,
                });
                expectOutcome(
                  confirmOutcome,
                  "confirmed",
                  `confirming the price of "${plan.name}"`,
                );
              } else {
                const setOutcome = await setPrice(tx, {
                  productId: product.product.id,
                  priceListId,
                  unitPrice: plan.unitPriceCents,
                  expectedCurrentPriceId: null,
                  actorId,
                  now: () => overdueReviewMoment,
                });
                expectOutcome(setOutcome, "applied", `pricing "${plan.name}"`);
              }

              if (!plan.active) {
                const deactivated = await deactivateProduct(tx, product.product.id);
                expectOutcome(deactivated, "deactivated", `deactivating product "${plan.name}"`);
              }
            }
          }
        }
      }

      for (const registerName of SAMPLE_REGISTER_NAMES) {
        const outcome = await createRegister(tx, {
          locationId: location.id,
          name: registerName,
          actorId,
        });
        expectOutcome(outcome, "created", `register "${registerName}"`);
      }

      if (await branchSettingsAreAtDefaults(tx, location.id)) {
        const [currentBranchSettings] = await tx
          .select({ version: branchSettings.version })
          .from(branchSettings)
          .where(eq(branchSettings.locationId, location.id));
        if (!currentBranchSettings) {
          throw new Error("sample-data: no branch settings are seeded for the location");
        }
        const settingsOutcome = await editBranchSettings(tx, {
          ...SAMPLE_BRANCH_SETTINGS,
          locationId: location.id,
          actorId,
          version: currentBranchSettings.version,
        });
        expectOutcome(settingsOutcome, "applied", "the branch settings");
      }

      const emailChangedTargetId = sampleUserIdsInOrder[0];
      const recoveryRequestedTargetId = sampleUserIdsInOrder[2] ?? sampleUserIdsInOrder[0];
      if (!emailChangedTargetId || !recoveryRequestedTargetId) {
        throw new Error("sample-data: no sample user available to scope a warning alert to");
      }

      const warningOpenOutcome = await openAlert(
        tx,
        {
          kind: "user_email_changed",
          scope: emailChangedTargetId,
          detail: {
            previousEmail: sampleEmail("anterior.muestra"),
            newEmail: sampleEmail("nueva.muestra"),
            actorId,
          },
        },
        { now: deps.now },
      );
      expectOutcome(warningOpenOutcome, "opened", "the open warning alert");

      const warningToCloseOutcome = await openAlert(
        tx,
        { kind: "backoffice_recovery_requested", scope: recoveryRequestedTargetId, detail: {} },
        { now: deps.now },
      );
      const warningToClose = expectOutcome(
        warningToCloseOutcome,
        "opened",
        "the warning alert to close",
      );
      const closedWarningOutcome = await closeAlert(
        tx,
        { id: warningToClose.alertId, actorId },
        { now: deps.now },
      );
      expectOutcome(closedWarningOutcome, "closed", "closing the warning alert");

      const escalationEligibleMoment = new Date(
        deps.now().getTime() - ESCALATION_ELIGIBLE_ALERT_AGE_MS,
      );
      const lockoutDetail = (sourceAddress: string) => ({
        sourceAddress,
        failureCount: SIGN_IN_FAILURE_LIMIT,
        blockedUntil: new Date(
          escalationEligibleMoment.getTime() + SIGN_IN_BLOCK_DURATION_MS,
        ).toISOString(),
      });
      const keptOpenLockoutOutcome = await openAlert(
        tx,
        {
          kind: "backoffice_sign_in_lockout",
          scope: SAMPLE_LOCKOUT_SOURCE_ADDRESSES.keptOpen,
          detail: lockoutDetail(SAMPLE_LOCKOUT_SOURCE_ADDRESSES.keptOpen),
        },
        { now: () => escalationEligibleMoment },
      );
      expectOutcome(keptOpenLockoutOutcome, "opened", "the critical alert kept open");
      const toCloseLockoutOutcome = await openAlert(
        tx,
        {
          kind: "backoffice_sign_in_lockout",
          scope: SAMPLE_LOCKOUT_SOURCE_ADDRESSES.closed,
          detail: lockoutDetail(SAMPLE_LOCKOUT_SOURCE_ADDRESSES.closed),
        },
        { now: () => escalationEligibleMoment },
      );
      const toCloseLockout = expectOutcome(
        toCloseLockoutOutcome,
        "opened",
        "the critical alert to close",
      );
      const escalatedCount = await escalateOverdueAlerts(tx, { now: deps.now });
      if (escalatedCount < 2) {
        throw new Error(
          `sample-data: expected at least 2 alerts to escalate to critical, only ${escalatedCount} did`,
        );
      }
      const closedCriticalOutcome = await closeAlert(
        tx,
        { id: toCloseLockout.alertId, actorId },
        { now: deps.now },
      );
      expectOutcome(closedCriticalOutcome, "closed", "closing the critical alert");

      return {
        kind: "loaded",
        summary: {
          categories: categoryCount,
          products: productCount,
          roles: SAMPLE_ROLES.length,
          users: sampleUserIdsInOrder.length + 1,
          registers: SAMPLE_REGISTER_NAMES.length,
        },
      };
    });
  } catch (error) {
    if (error instanceof SampleDataCollisionError) {
      return { kind: "collision", detail: error.message };
    }
    throw error;
  }
}
