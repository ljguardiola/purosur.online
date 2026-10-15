import type {
  SnapshotKeyRotation,
  SnapshotKeyRotationStore,
  SnapshotKeyRotationStoreTransaction,
  VersionedKey,
} from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, registerSnapshotKeys, registers } from "../platform/db/schema.js";
import { lockRegisterKeysOf, snapshotKeyPurpose } from "./drizzle-register-store.js";
import type { InstallationKeyCipher } from "./installation-key-cipher.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSnapshotKeyRotationTransaction<TQueryResult extends PgQueryResultHKT>
  implements SnapshotKeyRotationStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, cipher: InstallationKeyCipher, now: () => Date) {
    this.tx = tx;
    this.cipher = cipher;
    this.now = now;
  }

  async lockRegisterSnapshotKeys(registerId: string): Promise<VersionedKey[] | undefined> {
    await lockRegisterKeysOf(this.tx, registerId);
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(eq(registers.id, registerId));
    if (!register) {
      return undefined;
    }
    const rows = await this.tx
      .select({ version: registerSnapshotKeys.version, key: registerSnapshotKeys.key })
      .from(registerSnapshotKeys)
      .where(eq(registerSnapshotKeys.registerId, registerId));
    return rows.map((row) => ({
      version: row.version,
      key: this.cipher.open(row.key, snapshotKeyPurpose(registerId, row.version)),
    }));
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    await this.tx.insert(registerSnapshotKeys).values({
      registerId,
      version: key.version,
      key: this.cipher.seal(key.key, snapshotKeyPurpose(registerId, key.version)),
    });
  }

  async recordSnapshotKeyRotation(rotation: SnapshotKeyRotation): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register_snapshot_key",
      entityId: rotation.registerId,
      actorId: rotation.actorId,
      previousValue: { version: rotation.previousVersion },
      newValue: { version: rotation.newVersion },
      at: this.now(),
    });
  }
}

export class DrizzleSnapshotKeyRotationStore<TQueryResult extends PgQueryResultHKT>
  implements SnapshotKeyRotationStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher, now: () => Date) {
    this.db = db;
    this.cipher = cipher;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: SnapshotKeyRotationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleSnapshotKeyRotationTransaction(tx, this.cipher, this.now)),
    );
  }
}
