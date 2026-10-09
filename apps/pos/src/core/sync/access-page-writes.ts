import type { SyncChange } from "@purosur/contracts";
import { replacePin } from "@purosur/domain/credentials/use-cases";
import { derivePinVerifier } from "../credentials/pin-verifier";
import { SqlitePinReplacementStore } from "../credentials/sqlite-pin-replacement-store";
import type { LocalDatabase } from "../platform/local-database";
import type { RemovalOf } from "./pulled-change";

type ChangeOf<TEntity extends SyncChange["entity"]> = Extract<SyncChange, { entity: TEntity }>;

// Every save is guarded by the row's version, so a version the register already has, or an older
// one delivered late, never overwrites it, and nothing is ever deleted. A user left behind by a
// change of installation is brought back only by its own version, which the cloud never serves
// again once it removed that user. The PIN hash is turned into a verifier on its way in and is not
// kept. The wrong PINs counted against a user are cleared only by a verifier that differs from the
// one held, so a version that changes just a role or a name does not lift a lockout.
export function prepareAccessPageWrites(database: LocalDatabase, pepper: string | undefined) {
  const saveUser = database.prepare(
    `INSERT INTO users (id, first_name, role_id, salt, active, version, removed)
     VALUES (@id, @first_name, @role_id, @salt, @active, @version, 0)
     ON CONFLICT (id) DO UPDATE SET
       first_name = excluded.first_name,
       role_id = excluded.role_id,
       salt = excluded.salt,
       active = excluded.active,
       version = excluded.version,
       removed = 0
     WHERE excluded.version > users.version
        OR (excluded.version = users.version AND users.removed = 1)`,
  );
  const pinReplacementStore = new SqlitePinReplacementStore(database);
  const deleteVerifier = database.prepare("DELETE FROM pin_verifiers WHERE user_id = ?");
  const clearFailures = database.prepare("DELETE FROM pin_sign_in_failures WHERE user_id = ?");
  const saveRole = database.prepare(
    `INSERT INTO roles (id, name, is_administrator, version, removed)
     VALUES (@id, @name, @is_administrator, @version, 0)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       is_administrator = excluded.is_administrator,
       version = excluded.version,
       removed = 0
     WHERE excluded.version > roles.version`,
  );
  const savePermission = database.prepare(
    `INSERT INTO role_permissions (role_id, permission_key, active) VALUES (@role_id, @key, 1)
     ON CONFLICT (role_id, permission_key) DO UPDATE SET active = 1`,
  );
  const deactivatePermissionsOutside = database.prepare(
    `UPDATE role_permissions SET active = 0
     WHERE role_id = @role_id AND permission_key NOT IN (SELECT value FROM json_each(@keys))`,
  );
  const removeUser = database.prepare(
    "UPDATE users SET removed = 1, version = @version WHERE id = @id AND version < @version",
  );
  const removeRole = database.prepare(
    "UPDATE roles SET removed = 1, version = @version WHERE id = @id AND version < @version",
  );
  const deactivatePermissions = database.prepare(
    "UPDATE role_permissions SET active = 0 WHERE role_id = ?",
  );

  return {
    user({ entity_id, row }: ChangeOf<"user">): void {
      if (pepper === undefined) {
        throw new Error("no installation has been adopted to derive PIN verifiers for");
      }
      const saved = saveUser.run({
        id: entity_id,
        first_name: row.first_name,
        role_id: row.role_id,
        salt: row.salt,
        active: row.active ? 1 : 0,
        version: row.version,
      });
      if (saved.changes === 0) {
        return;
      }
      replacePin(
        { store: pinReplacementStore },
        {
          userId: entity_id,
          credential: row.pin_hash === null ? undefined : derivePinVerifier(pepper, row.pin_hash),
        },
      );
    },

    role({ entity_id, row }: ChangeOf<"role">): void {
      const saved = saveRole.run({
        id: entity_id,
        name: row.name,
        is_administrator: row.is_administrator ? 1 : 0,
        version: row.version,
      });
      if (saved.changes === 0) {
        return;
      }
      for (const key of row.permission_keys) {
        savePermission.run({ role_id: entity_id, key });
      }
      deactivatePermissionsOutside.run({
        role_id: entity_id,
        keys: JSON.stringify(row.permission_keys),
      });
    },

    removal({ entity_id, removed_entity, version }: RemovalOf<"user" | "role">): void {
      if (removed_entity === "user") {
        if (removeUser.run({ id: entity_id, version }).changes > 0) {
          deleteVerifier.run(entity_id);
          clearFailures.run(entity_id);
        }
        return;
      }
      if (removeRole.run({ id: entity_id, version }).changes > 0) {
        deactivatePermissions.run(entity_id);
      }
    },
  };
}
