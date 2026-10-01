import type {
  ChangeLog,
  ChangeLogTransaction,
  PullAudience,
  PulledEntity,
  PullingRegister,
  PullReach,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, gt, inArray, max, or, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { readBranchSettings } from "../branch/drizzle-branch-settings-reader.js";
import {
  branchSettings,
  changes,
  deviceState,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import type { PulledCloudChange, RemovedEntity } from "./pulled-changes.js";
import {
  readBuyerIdentificationThresholds,
  readBuyerTaxStatusSets,
  readCategories,
  readDiscounts,
  readIssuerIdentificationVersions,
  readPriceLists,
  readPrices,
  readProducts,
  readRegisterPointsOfSale,
  readRegisters,
  readRoles,
  readTags,
  readUsers,
} from "./read-pulled-rows.js";

type LoggedEntity = PulledEntity;

interface LoggedRow {
  changeSeq: number;
  entity: LoggedEntity;
  entityId: string;
  version: number;
}

function idsOf(logged: readonly LoggedRow[], entity: LoggedEntity): string[] {
  return [...new Set(logged.filter((row) => row.entity === entity).map((row) => row.entityId))];
}

class DrizzleChangeLogTransaction<TQueryResult extends PgQueryResultHKT>
  implements ChangeLogTransaction<PulledCloudChange>
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async recordObservedPull(deviceId: string, since: number, at: Date): Promise<void> {
    await this.tx
      .insert(deviceState)
      .values({ deviceId, lastPullSince: since, lastPulledAt: at })
      .onConflictDoUpdate({
        target: deviceState.deviceId,
        set: { lastPullSince: since, lastPulledAt: at },
      });
  }

  async pullingRegister(deviceId: string): Promise<PullingRegister> {
    const [register] = await this.tx
      .select({
        registerId: registers.id,
        locationId: registers.locationId,
        priceListId: branchSettings.priceListId,
      })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .leftJoin(branchSettings, eq(branchSettings.locationId, registers.locationId))
      .where(eq(registerInstallations.id, deviceId));
    if (!register) {
      throw new Error("an authenticated installation has no register");
    }
    return register;
  }

  async changesAfter(
    audience: PullAudience,
    since: number,
    limit: number,
  ): Promise<PulledCloudChange[]> {
    const logged = await this.loggedAfter(audience, since, limit);

    // Every change carries the row as it is now, so one read serves every change of that row.
    const categoryRows = await readCategories(this.tx, idsOf(logged, "category"));
    const productRows = await readProducts(this.tx, idsOf(logged, "product"));
    const tagRows = await readTags(this.tx, idsOf(logged, "tag"));
    const priceListRows = await readPriceLists(this.tx, idsOf(logged, "price_list"));
    const priceRows = await readPrices(this.tx, idsOf(logged, "price"));
    const userRows = await readUsers(this.tx, idsOf(logged, "user"));
    const roleRows = await readRoles(this.tx, idsOf(logged, "role"));
    const registerRows = await readRegisters(this.tx, idsOf(logged, "register"));
    const registerPointOfSaleRows = await readRegisterPointsOfSale(
      this.tx,
      idsOf(logged, "register_point_of_sale"),
    );
    const discountRows = await readDiscounts(this.tx, idsOf(logged, "discount"));
    const issuerRows = await readIssuerIdentificationVersions(
      this.tx,
      logged.filter((row) => row.entity === "issuer_identification").map((row) => row.version),
    );
    const thresholdRows = await readBuyerIdentificationThresholds(
      this.tx,
      idsOf(logged, "buyer_identification_threshold"),
    );
    const taxStatusSetRows = await readBuyerTaxStatusSets(
      this.tx,
      idsOf(logged, "buyer_tax_status_set"),
    );
    const settingsId = logged.find((row) => row.entity === "branch_settings")?.entityId;
    const settingsRow = settingsId === undefined ? undefined : await this.readSettings(settingsId);
    const removedVersions = {
      category: await this.latestLoggedVersions(
        "category",
        absent(logged, "category", categoryRows),
      ),
      product: await this.latestLoggedVersions("product", absent(logged, "product", productRows)),
      tag: await this.latestLoggedVersions("tag", absent(logged, "tag", tagRows)),
      price: await this.latestLoggedVersions("price", absent(logged, "price", priceRows)),
      user: await this.latestLoggedVersions("user", absent(logged, "user", userRows)),
      role: await this.latestLoggedVersions("role", absent(logged, "role", roleRows)),
      register: await this.latestLoggedVersions(
        "register",
        absent(logged, "register", registerRows),
      ),
      discount: await this.latestLoggedVersions(
        "discount",
        absent(logged, "discount", discountRows),
      ),
    };

    const pulled: PulledCloudChange[] = [];
    for (const { changeSeq, entity, entityId, version } of logged) {
      const removal = (removedEntity: RemovedEntity): PulledCloudChange => {
        const version = removedVersions[removedEntity].get(entityId);
        if (version === undefined) {
          throw new Error(`a removed ${removedEntity} has no logged version`);
        }
        return { changeSeq, entity: "removal", entityId, removedEntity, version };
      };
      switch (entity) {
        case "branch_settings":
          pulled.push({ changeSeq, entity, entityId, row: requiredRow(settingsRow, entity) });
          break;
        case "price_list":
          pulled.push({
            changeSeq,
            entity,
            entityId,
            row: requiredRow(priceListRows.get(entityId), entity),
          });
          break;
        case "category": {
          const row = categoryRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "product": {
          const row = productRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "tag": {
          const row = tagRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "price": {
          const row = priceRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "user": {
          const row = userRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "role": {
          const row = roleRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "register": {
          const row = registerRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "register_point_of_sale":
          pulled.push({
            changeSeq,
            entity,
            entityId,
            row: requiredRow(registerPointOfSaleRows.get(entityId), entity),
          });
          break;
        case "discount": {
          const row = discountRows.get(entityId);
          pulled.push(row === undefined ? removal(entity) : { changeSeq, entity, entityId, row });
          break;
        }
        case "issuer_identification":
          pulled.push({
            changeSeq,
            entity,
            entityId,
            row: requiredRow(issuerRows.get(version), entity),
          });
          break;
        case "buyer_identification_threshold":
          pulled.push({
            changeSeq,
            entity,
            entityId,
            row: requiredRow(thresholdRows.get(entityId), entity),
          });
          break;
        case "buyer_tax_status_set":
          pulled.push({
            changeSeq,
            entity,
            entityId,
            row: requiredRow(taxStatusSetRows.get(entityId), entity),
          });
          break;
      }
    }
    return pulled;
  }

  private async loggedAfter(
    audience: PullAudience,
    since: number,
    limit: number,
  ): Promise<LoggedRow[]> {
    const reached = Object.entries(audience).map(([entity, reach]) =>
      inReach(entity as LoggedEntity, reach),
    );
    const rows = await this.tx
      .select({
        changeSeq: changes.changeSeq,
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
      })
      .from(changes)
      .where(and(gt(changes.changeSeq, since), or(...reached)))
      .orderBy(asc(changes.changeSeq))
      .limit(limit);
    return rows.map((row) => ({ ...row, entity: row.entity as LoggedEntity }));
  }

  private async readSettings(locationId: string) {
    await this.tx
      .select({ locationId: branchSettings.locationId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId))
      .for("share");
    return readBranchSettings(this.tx, locationId);
  }

  private async latestLoggedVersions(
    entity: RemovedEntity,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.tx
      .select({ entityId: changes.entityId, version: max(changes.version) })
      .from(changes)
      .where(and(eq(changes.entity, entity), inArray(changes.entityId, [...ids])))
      .groupBy(changes.entityId);
    return new Map(
      rows.flatMap(({ entityId, version }) => (version === null ? [] : [[entityId, version]])),
    );
  }
}

function inReach(entity: LoggedEntity, reach: PullReach): SQL | undefined {
  const ofEntity = eq(changes.entity, entity);
  switch (reach.kind) {
    case "every_row":
      return ofEntity;
    case "row":
      return and(ofEntity, eq(changes.entityId, reach.id));
    case "rows_of_branch":
      return and(ofEntity, eq(changes.locationId, reach.locationId));
    case "rows_of_price_list":
      return and(ofEntity, eq(changes.priceListId, reach.priceListId));
    case "none":
      return undefined;
  }
}

function absent(
  logged: readonly LoggedRow[],
  entity: LoggedEntity,
  rows: ReadonlyMap<string, unknown>,
): string[] {
  return idsOf(logged, entity).filter((id) => !rows.has(id));
}

function requiredRow<TRow>(row: TRow | undefined, entity: LoggedEntity): TRow {
  if (row === undefined) {
    throw new Error(`a logged ${entity} change has no row`);
  }
  return row;
}

export class DrizzleChangeLog<TQueryResult extends PgQueryResultHKT>
  implements ChangeLog<PulledCloudChange>
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // Read committed, so a device's overlapping pulls wait on its state row instead of failing. Only
  // settings and products are read in more than one statement, so only they are share-locked, in
  // id order: every save locks the row before touching what belongs to it, and the lock waits for
  // it. Locking anything else would take locks in another order than the writers do. A user with
  // its role and PIN, a role with its permissions, a register and a discount are each read in one statement.
  transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<PulledCloudChange>) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleChangeLogTransaction(tx)));
  }
}
