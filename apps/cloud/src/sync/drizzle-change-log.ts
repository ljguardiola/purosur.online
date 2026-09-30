import type { ChangeLog, ChangeLogTransaction, PullAudience } from "@purosur/domain/sync/use-cases";
import { and, asc, eq, gt, inArray, max, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { readBranchSettings } from "../branch/branch-settings-read-route.js";
import { branchSettings, changes, deviceState } from "../platform/db/schema.js";
import type { PulledCloudChange, RemovedEntity } from "./pulled-changes.js";
import {
  readCategories,
  readPriceLists,
  readPrices,
  readProducts,
  readRegisters,
  readRoles,
  readTags,
  readUsers,
} from "./read-pulled-rows.js";

type LoggedEntity =
  | "branch_settings"
  | "category"
  | "product"
  | "tag"
  | "price_list"
  | "price"
  | "user"
  | "role"
  | "register";

interface LoggedRow {
  changeSeq: number;
  entity: LoggedEntity;
  entityId: string;
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

  async changesAfter(
    audience: PullAudience,
    since: number,
    limit: number,
  ): Promise<PulledCloudChange[]> {
    const { locationId } = audience;
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
    const settingsRow = logged.some((row) => row.entity === "branch_settings")
      ? await this.readSettings(locationId)
      : undefined;
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
    };

    const pulled: PulledCloudChange[] = [];
    for (const { changeSeq, entity, entityId } of logged) {
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
      }
    }
    return pulled;
  }

  private async loggedAfter(
    { locationId, registerId }: PullAudience,
    since: number,
    limit: number,
  ): Promise<LoggedRow[]> {
    const [settings] = await this.tx
      .select({ priceListId: branchSettings.priceListId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    const priceListId = settings?.priceListId;

    const rows = await this.tx
      .select({ changeSeq: changes.changeSeq, entity: changes.entity, entityId: changes.entityId })
      .from(changes)
      .where(
        and(
          gt(changes.changeSeq, since),
          or(
            and(eq(changes.entity, "branch_settings"), eq(changes.entityId, locationId)),
            inArray(changes.entity, ["category", "product", "tag", "role"]),
            and(eq(changes.entity, "user"), eq(changes.locationId, locationId)),
            and(eq(changes.entity, "register"), eq(changes.entityId, registerId)),
            priceListId === undefined
              ? undefined
              : and(eq(changes.entity, "price_list"), eq(changes.entityId, priceListId)),
            priceListId === undefined
              ? undefined
              : and(eq(changes.entity, "price"), eq(changes.priceListId, priceListId)),
          ),
        ),
      )
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
  // its role and PIN, a role with its permissions, and a register are each read in one statement.
  transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<PulledCloudChange>) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleChangeLogTransaction(tx)));
  }
}
