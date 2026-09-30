import type { SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey, RoleAccess } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

export interface SignInRecord {
  firstName: string;
  salt: string;
  verifier: string;
  access: RoleAccess;
}

export interface SignInStore {
  signableUsers(): SignInUser[];
  authorizers(permission: AuthorizablePermissionKey): SignInUser[];
  signInRecord(userId: string): SignInRecord | undefined;
}

interface RecordRow {
  first_name: string;
  salt: string;
  verifier: string;
  is_administrator: number | null;
}

export class SqliteSignInStore implements SignInStore {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  signableUsers(): SignInUser[] {
    return this.database
      .prepare<[], SignInUser>(
        `SELECT users.id AS id, users.first_name AS first_name
         FROM users JOIN pin_verifiers ON pin_verifiers.user_id = users.id
         WHERE users.active = 1 AND users.removed = 0 AND users.salt IS NOT NULL`,
      )
      .all();
  }

  authorizers(permission: AuthorizablePermissionKey): SignInUser[] {
    return this.database
      .prepare<[string], SignInUser>(
        `SELECT users.id AS id, users.first_name AS first_name
         FROM users
         JOIN pin_verifiers ON pin_verifiers.user_id = users.id
         JOIN roles ON roles.id = users.role_id AND roles.removed = 0
         WHERE users.active = 1 AND users.removed = 0 AND users.salt IS NOT NULL
           AND (roles.is_administrator = 1 OR EXISTS (
             SELECT 1 FROM role_permissions
             WHERE role_permissions.role_id = roles.id
               AND role_permissions.permission_key = ?
               AND role_permissions.active = 1))`,
      )
      .all(permission);
  }

  signInRecord(userId: string): SignInRecord | undefined {
    const row = this.database
      .prepare<[string], RecordRow>(
        `SELECT users.first_name AS first_name, users.salt AS salt,
                pin_verifiers.verifier AS verifier, roles.is_administrator AS is_administrator
         FROM users
         JOIN pin_verifiers ON pin_verifiers.user_id = users.id
         LEFT JOIN roles ON roles.id = users.role_id AND roles.removed = 0
         WHERE users.id = ? AND users.active = 1 AND users.removed = 0 AND users.salt IS NOT NULL`,
      )
      .get(userId);
    if (row === undefined) {
      return undefined;
    }
    const permissionKeys =
      row.is_administrator === null
        ? []
        : this.database
            .prepare<[string], { permission_key: string }>(
              `SELECT role_permissions.permission_key AS permission_key
               FROM role_permissions
               JOIN users ON users.role_id = role_permissions.role_id
               WHERE users.id = ? AND role_permissions.active = 1`,
            )
            .all(userId)
            .map((permission) => permission.permission_key);
    return {
      firstName: row.first_name,
      salt: row.salt,
      verifier: row.verifier,
      access: { isAdministrator: row.is_administrator === 1, permissionKeys },
    };
  }
}
