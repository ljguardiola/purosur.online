import type { SignInUser } from "@purosur/contracts";
import { type AuthorizablePermissionKey, holdsPermission, type RoleAccess } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

export interface SignInRecord {
  firstName: string;
  salt: string;
  verifier: string;
  access: RoleAccess;
}

export interface PinSignInFailures {
  consecutiveFailures: number;
  lastFailedAt: Date;
}

export interface SignInStore {
  signableUsers(): SignInUser[];
  authorizers(permission: AuthorizablePermissionKey): SignInUser[];
  signInRecord(userId: string): SignInRecord | undefined;
  roleAccess(userId: string): RoleAccess | undefined;
  pinSignInFailures(userId: string): PinSignInFailures | undefined;
  recordPinSignInFailure(userId: string, at: Date): PinSignInFailures;
  withdrawPinSignInFailure(userId: string): void;
  clearPinSignInFailures(userId: string): void;
}

interface FailuresRow {
  consecutive_failures: number;
  last_failed_at: string;
}

function failuresOf(row: FailuresRow): PinSignInFailures {
  return {
    consecutiveFailures: row.consecutive_failures,
    lastFailedAt: new Date(row.last_failed_at),
  };
}

interface RecordRow {
  first_name: string;
  salt: string;
  verifier: string;
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
    return this.signableUsers().filter((user) => {
      const record = this.signInRecord(user.id);
      return record !== undefined && holdsPermission(record.access, permission);
    });
  }

  signInRecord(userId: string): SignInRecord | undefined {
    const row = this.database
      .prepare<[string], RecordRow>(
        `SELECT users.first_name AS first_name, users.salt AS salt,
                pin_verifiers.verifier AS verifier
         FROM users
         JOIN pin_verifiers ON pin_verifiers.user_id = users.id
         WHERE users.id = ? AND users.active = 1 AND users.removed = 0 AND users.salt IS NOT NULL`,
      )
      .get(userId);
    const access = row === undefined ? undefined : this.roleAccess(userId);
    if (row === undefined || access === undefined) {
      return undefined;
    }
    return { firstName: row.first_name, salt: row.salt, verifier: row.verifier, access };
  }

  roleAccess(userId: string): RoleAccess | undefined {
    const row = this.database
      .prepare<[string], { is_administrator: number | null }>(
        `SELECT roles.is_administrator AS is_administrator
         FROM users
         LEFT JOIN roles ON roles.id = users.role_id AND roles.removed = 0
         WHERE users.id = ? AND users.active = 1 AND users.removed = 0`,
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
    return { isAdministrator: row.is_administrator === 1, permissionKeys };
  }

  pinSignInFailures(userId: string): PinSignInFailures | undefined {
    const row = this.database
      .prepare<[string], FailuresRow>(
        "SELECT consecutive_failures, last_failed_at FROM pin_sign_in_failures WHERE user_id = ?",
      )
      .get(userId);
    return row === undefined ? undefined : failuresOf(row);
  }

  recordPinSignInFailure(userId: string, at: Date): PinSignInFailures {
    const row = this.database
      .prepare<{ user_id: string; last_failed_at: string }, FailuresRow>(
        `INSERT INTO pin_sign_in_failures (user_id, consecutive_failures, last_failed_at)
         VALUES (@user_id, 1, @last_failed_at)
         ON CONFLICT (user_id) DO UPDATE SET
           consecutive_failures = consecutive_failures + 1,
           last_failed_at = excluded.last_failed_at
         RETURNING consecutive_failures, last_failed_at`,
      )
      .get({ user_id: userId, last_failed_at: at.toISOString() });
    if (row === undefined) {
      throw new Error("the PIN sign-in failure was not recorded");
    }
    return failuresOf(row);
  }

  withdrawPinSignInFailure(userId: string): void {
    this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM pin_sign_in_failures WHERE user_id = ? AND consecutive_failures = 1")
        .run(userId);
      this.database
        .prepare(
          "UPDATE pin_sign_in_failures SET consecutive_failures = consecutive_failures - 1 WHERE user_id = ?",
        )
        .run(userId);
    })();
  }

  clearPinSignInFailures(userId: string): void {
    this.database.prepare("DELETE FROM pin_sign_in_failures WHERE user_id = ?").run(userId);
  }
}
