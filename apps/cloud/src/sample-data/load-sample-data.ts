import {
  argentinaCalendarDay,
  RECOVERY_TOKEN_LIFETIME_MS,
  SIGN_IN_BLOCK_DURATION_MS,
  SIGN_IN_FAILURE_LIMIT,
} from "@purosur/domain";
import { createRole, createUser, deactivateUser } from "@purosur/domain/access/use-cases";
import { closeAlert, escalateOverdueAlerts } from "@purosur/domain/alerts/use-cases";
import { editBranchSettings } from "@purosur/domain/branch/use-cases";
import {
  allocateInternalBarcode,
  createCategory,
  createProduct,
  createTag,
  deactivateProduct,
  deactivateTag,
} from "@purosur/domain/catalog/use-cases";
import { confirmPrice, createDiscount, setPrice } from "@purosur/domain/pricing/use-cases";
import { createRegister } from "@purosur/domain/register/use-cases";
import { and, eq, like, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleRoleStore } from "../access/drizzle-role-store.js";
import { DrizzleUserStore } from "../access/drizzle-user-store.js";
import { hashSourceAddress } from "../access/sign-in-lockout.js";
import { DrizzleAlertStore } from "../alerts/drizzle-alert-store.js";
import { openAlert } from "../alerts/open-alert.js";
import { DrizzleBranchSettingsStore } from "../branch/drizzle-branch-settings-store.js";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { DrizzleInternalBarcodeStore } from "../catalog/drizzle-internal-barcode-store.js";
import { branchSettings, locations, roles, userRoles, users } from "../platform/db/schema.js";
import { DrizzleDiscountStore } from "../pricing/drizzle-discount-store.js";
import { DrizzlePricingStore } from "../pricing/drizzle-pricing-store.js";
import { DrizzleBranchRegisterStore } from "../register/drizzle-branch-register-store.js";
import { PendingChanges } from "../sync/change-log.js";
import { branchSettingsAreAtDefaults } from "./sample-branch-settings.js";
import {
  SAMPLE_ADMINISTRATOR,
  SAMPLE_BRANCH_SETTINGS,
  SAMPLE_CATEGORY_TREE,
  SAMPLE_DISCOUNTS,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_LOCKOUT_SOURCE_ADDRESSES,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  SAMPLE_TAGS,
  sampleDiscountWindow,
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

      const loadedAt = deps.now();
      const loadClock = () => loadedAt;
      const pending = new PendingChanges();

      const userStore = new DrizzleUserStore(tx, loadClock, pending);
      const administratorOutcome = await createUser(
        { store: userStore, clock: deps },
        {
          firstName: SAMPLE_ADMINISTRATOR.firstName,
          email: SAMPLE_ADMINISTRATOR.email,
          roleId: bootstrapAdministrator.roleId,
          locationId: location.id,
          actorId: bootstrapAdministrator.id,
          actorMayReactivateUsers: false,
        },
      );
      const sampleAdministrator = expectOutcome(
        administratorOutcome,
        "created",
        "the sample administrator user",
      );
      const actorId = sampleAdministrator.user.id;

      const roleIdByName = new Map<string, string>();
      for (const rolePlan of SAMPLE_ROLES) {
        const outcome = await createRole(
          { store: new DrizzleRoleStore(tx, loadClock, pending) },
          {
            name: rolePlan.name,
            permissionKeys: [...rolePlan.permissionKeys],
            actorId,
          },
        );
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
          const outcome = await createUser(
            { store: userStore, clock: deps },
            {
              firstName: userPlan.firstName,
              email: userPlan.email,
              roleId,
              locationId: location.id,
              actorId,
              actorMayReactivateUsers: false,
            },
          );
          const created = expectOutcome(outcome, "created", `user "${userPlan.firstName}"`);
          sampleUserIdsInOrder.push(created.user.id);
          if (!userPlan.active) {
            const deactivated = await deactivateUser(
              { store: userStore },
              { id: created.user.id, actorId, at: deps.now() },
            );
            expectOutcome(deactivated, "deactivated", `deactivating user "${userPlan.firstName}"`);
          }
        }
      }

      const recentMoment = deps.now();
      const overdueReviewMoment = new Date(recentMoment.getTime() - OVERDUE_PRICE_REVIEW_AGE_MS);

      const catalogStore = new DrizzleCatalogStore(tx, pending);
      const pricingStore = new DrizzlePricingStore(tx, loadClock, pending);
      const pricingPortsAt = (moment: Date) => ({
        store: pricingStore,
        clock: { now: () => moment },
      });
      const tagIdByName = new Map<string, string>();
      for (const tagPlan of SAMPLE_TAGS) {
        const tagOutcome = await createTag(catalogStore, { name: tagPlan.name });
        const tag = expectOutcome(tagOutcome, "created", `tag "${tagPlan.name}"`);
        tagIdByName.set(tagPlan.name, tag.tag.id);
      }
      const categoryIdByName = new Map<string, string>();
      const productIdByName = new Map<string, string>();
      let categoryCount = 0;
      let productCount = 0;
      for (const top of SAMPLE_CATEGORY_TREE) {
        const topOutcome = await createCategory(catalogStore, {
          name: top.name,
          parentId: null,
        });
        const topCategory = expectOutcome(topOutcome, "created", `category "${top.name}"`);
        categoryIdByName.set(top.name, topCategory.category.id);
        categoryCount += 1;

        for (const mid of top.mids) {
          const midOutcome = await createCategory(catalogStore, {
            name: mid.name,
            parentId: topCategory.category.id,
          });
          const midCategory = expectOutcome(midOutcome, "created", `category "${mid.name}"`);
          categoryIdByName.set(mid.name, midCategory.category.id);
          categoryCount += 1;

          for (const leaf of mid.leaves) {
            const leafOutcome = await createCategory(catalogStore, {
              name: leaf.name,
              parentId: midCategory.category.id,
            });
            const leafCategory = expectOutcome(leafOutcome, "created", `category "${leaf.name}"`);
            categoryIdByName.set(leaf.name, leafCategory.category.id);
            categoryCount += 1;

            for (const plan of leaf.products) {
              const barcode =
                plan.barcode.kind === "manufacturer"
                  ? plan.barcode.code
                  : (await allocateInternalBarcode(new DrizzleInternalBarcodeStore(tx))).code;
              const productOutcome = await createProduct(catalogStore, {
                name: plan.name,
                categoryId: leafCategory.category.id,
                brandId: null,
                saleUnit: plan.saleUnit,
                barcodes: [barcode],
                tagIds: plan.tagNames.map((tagName) => {
                  const tagId = tagIdByName.get(tagName);
                  if (!tagId) {
                    throw new Error(`sample-data: tag "${tagName}" was not created`);
                  }
                  return tagId;
                }),
                netContent: plan.netContent,
              });
              const product = expectOutcome(productOutcome, "created", `product "${plan.name}"`);
              productIdByName.set(plan.name, product.product.id);
              productCount += 1;

              // Priced while still active: `setPrice`/`confirmPrice` only ever act on an active
              // product, so an inactive sample product is priced first and deactivated last.
              if (plan.pricePlan === "current") {
                const setOutcome = await setPrice(pricingPortsAt(recentMoment), {
                  productId: product.product.id,
                  locationId: location.id,
                  unitPrice: plan.unitPriceCents,
                  expectedCurrentPriceId: null,
                  actorId,
                });
                const applied = expectOutcome(setOutcome, "applied", `pricing "${plan.name}"`);
                const confirmOutcome = await confirmPrice(pricingPortsAt(recentMoment), {
                  productId: product.product.id,
                  locationId: location.id,
                  expectedCurrentPriceId: applied.price.id,
                  actorId,
                });
                expectOutcome(
                  confirmOutcome,
                  "confirmed",
                  `confirming the price of "${plan.name}"`,
                );
              } else {
                const setOutcome = await setPrice(pricingPortsAt(overdueReviewMoment), {
                  productId: product.product.id,
                  locationId: location.id,
                  unitPrice: plan.unitPriceCents,
                  expectedCurrentPriceId: null,
                  actorId,
                });
                expectOutcome(setOutcome, "applied", `pricing "${plan.name}"`);
              }

              if (!plan.active) {
                const deactivated = await deactivateProduct(catalogStore, product.product.id);
                expectOutcome(deactivated, "deactivated", `deactivating product "${plan.name}"`);
              }
            }
          }
        }
      }

      for (const tagPlan of SAMPLE_TAGS.filter((plan) => !plan.active)) {
        const tagId = tagIdByName.get(tagPlan.name);
        if (!tagId) {
          throw new Error(`sample-data: tag "${tagPlan.name}" was not created`);
        }
        const deactivated = await deactivateTag(catalogStore, tagId);
        expectOutcome(deactivated, "deactivated", `deactivating tag "${tagPlan.name}"`);
      }

      const discountStore = new DrizzleDiscountStore(tx, pending);
      const loadDay = argentinaCalendarDay(recentMoment);
      for (const plan of SAMPLE_DISCOUNTS) {
        const targetId = {
          CATEGORY: categoryIdByName,
          PRODUCT: productIdByName,
          TAG: tagIdByName,
        }[plan.target.kind].get(plan.target.name);
        if (!targetId) {
          throw new Error(`sample-data: the target "${plan.target.name}" was not created`);
        }
        const discountOutcome = await createDiscount(
          { store: discountStore },
          {
            name: plan.name,
            benefit: plan.benefit,
            target: { kind: plan.target.kind, id: targetId },
            ...sampleDiscountWindow(plan, loadDay),
            weekdays: [...plan.weekdays],
          },
        );
        expectOutcome(discountOutcome, "created", `discount "${plan.name}"`);
      }

      const registerStore = new DrizzleBranchRegisterStore(tx, loadClock, pending);
      for (const registerName of SAMPLE_REGISTER_NAMES) {
        const outcome = await createRegister(registerStore, {
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
        const settingsOutcome = await editBranchSettings(
          { store: new DrizzleBranchSettingsStore(tx, loadClock, pending) },
          {
            ...SAMPLE_BRANCH_SETTINGS,
            locationId: location.id,
            actorId,
            version: currentBranchSettings.version,
          },
        );
        expectOutcome(settingsOutcome, "edited", "the branch settings");
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

      const openingPorts = { store: new DrizzleAlertStore(tx, deps.now), clock: { now: deps.now } };
      const closingPorts = { ...openingPorts, hasher: { hash: hashSourceAddress } };
      const recoveryRequestedAt = deps.now();
      const warningToCloseOutcome = await openAlert(
        tx,
        {
          kind: "backoffice_recovery_requested",
          scope: recoveryRequestedTargetId,
          detail: {
            requestedAt: recoveryRequestedAt.toISOString(),
            issuedAt: recoveryRequestedAt.toISOString(),
            expiresAt: new Date(
              recoveryRequestedAt.getTime() + RECOVERY_TOKEN_LIFETIME_MS,
            ).toISOString(),
          },
        },
        { now: deps.now },
      );
      const warningToClose = expectOutcome(
        warningToCloseOutcome,
        "opened",
        "the warning alert to close",
      );
      const closedWarningOutcome = await closeAlert(closingPorts, {
        alertId: warningToClose.alertId,
        closedBy: actorId,
      });
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
      const escalatedCount = await escalateOverdueAlerts(openingPorts);
      if (escalatedCount < 2) {
        throw new Error(
          `sample-data: expected at least 2 alerts to escalate to critical, only ${escalatedCount} did`,
        );
      }
      const closedCriticalOutcome = await closeAlert(closingPorts, {
        alertId: toCloseLockout.alertId,
        closedBy: actorId,
      });
      expectOutcome(closedCriticalOutcome, "closed", "closing the critical alert");
      await pending.log(tx);

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
