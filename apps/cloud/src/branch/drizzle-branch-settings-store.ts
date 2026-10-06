import type {
  BranchSettings,
  BranchSettingsStore,
  BranchSettingsStoreTransaction,
  NewBranchSettingsVersion,
} from "@purosur/domain/branch/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, branchHours, branchSettings } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { toBranchSettingsWire } from "./branch-settings-wire.js";
import { readBranchSettings } from "./drizzle-branch-settings-reader.js";

class DrizzleBranchSettingsStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BranchSettingsStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  // The row lock makes a concurrent save wait instead of racing the version check and the hours
  // read and write.
  async lockCurrentBranchSettings(locationId: string): Promise<BranchSettings> {
    const [locked] = await this.tx
      .select({ locationId: branchSettings.locationId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId))
      .for("update");
    if (!locked) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    return readBranchSettings(this.tx, locationId);
  }

  async recordBranchSettingsVersion(
    next: NewBranchSettingsVersion,
    previous: BranchSettings,
  ): Promise<void> {
    const { locationId, recordedBy, hours, ...settings } = next;
    await this.tx
      .update(branchSettings)
      .set({
        address: settings.address,
        whatsappNumber: settings.whatsappNumber,
        instagramHandle: settings.instagramHandle,
        expiringLotAlertDays: settings.expiringLotAlertDays,
        unreviewedPriceAlertDays: settings.unreviewedPriceAlertDays,
        goodConditionReturnDays: settings.goodConditionReturnDays,
        version: settings.version,
      })
      .where(eq(branchSettings.locationId, locationId));

    await this.tx.delete(branchHours).where(eq(branchHours.locationId, locationId));
    if (hours.length > 0) {
      await this.tx.insert(branchHours).values(hours.map((range) => ({ ...range, locationId })));
    }

    this.pending.note({
      entity: "branch_settings",
      entityId: locationId,
      version: settings.version,
      op: "update",
    });

    await this.tx.insert(auditLog).values({
      entity: "branch_settings",
      entityId: locationId,
      actorId: recordedBy,
      previousValue: toBranchSettingsWire(previous),
      newValue: toBranchSettingsWire({ ...settings, hours }),
      at: this.now(),
    });
  }
}

export class DrizzleBranchSettingsStore<TQueryResult extends PgQueryResultHKT>
  implements BranchSettingsStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date, pending?: PendingChanges) {
    this.db = db;
    this.now = now;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: BranchSettingsStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleBranchSettingsStoreTransaction(tx, this.now, pending)),
    );
  }
}
