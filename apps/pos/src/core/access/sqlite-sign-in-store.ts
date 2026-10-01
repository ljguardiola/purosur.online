import type { SignInUser } from "@purosur/contracts";
import {
  type AuthorizablePermissionKey,
  decodePinSalt,
  holdsPermission,
  type RoleAccess,
} from "@purosur/domain";
import type { PinHolder, SignablePerson } from "@purosur/domain/access/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { PinCredential } from "./pin-matching";

export interface SignInRecord {
  firstName: string;
  salt: string;
  verifier: string;
  access: RoleAccess;
}

export interface ActivePerson {
  firstName: string;
  access: RoleAccess;
}

export interface PinSignInFailures {
  consecutiveFailures: number;
  lastFailedAt: Date;
}

export interface SignInStore {
  signableUsers(): SignInUser[];
  remember(userId: string): void;
  firstNameOf(userId: string): string | undefined;
  authorizers(permission: AuthorizablePermissionKey): SignInUser[];
  signInRecord(userId: string): SignInRecord | undefined;
  pinHolder(userId: string): PinHolder<PinCredential> | undefined;
  signablePeople(): SignablePerson[];
  activePerson(userId: string): ActivePerson | undefined;
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
         FROM users
         JOIN pin_verifiers ON pin_verifiers.user_id = users.id
         JOIN remembered_users ON remembered_users.user_id = users.id
         WHERE users.active = 1 AND users.removed = 0 AND users.salt IS NOT NULL`,
      )
      .all();
  }

  remember(userId: string): void {
    this.database
      .prepare("INSERT INTO remembered_users (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING")
      .run(userId);
  }

  firstNameOf(userId: string): string | undefined {
    return this.database
      .prepare<[string], { first_name: string }>(
        "SELECT first_name FROM users WHERE id = ? AND active = 1 AND removed = 0",
      )
      .get(userId)?.first_name;
  }

  authorizers(permission: AuthorizablePermissionKey): SignInUser[] {
    return this.authorizersWhere(({ access }) => holdsPermission(access, permission));
  }

  authorizersWhere(mayAuthorize: (person: { id: string; access: RoleAccess }) => boolean) {
    return this.signableUsers().filter((user) => {
      const record = this.signInRecord(user.id);
      return record !== undefined && mayAuthorize({ id: user.id, access: record.access });
    });
  }

  signablePeople(): SignablePerson[] {
    return this.signableUsers().flatMap(({ id }) => {
      const record = this.signInRecord(id);
      return record === undefined
        ? []
        : [{ id, firstName: record.firstName, access: record.access }];
    });
  }

  pinHolder(userId: string): PinHolder<PinCredential> | undefined {
    const record = this.signInRecord(userId);
    const salt = record === undefined ? undefined : decodePinSalt(record.salt);
    return record === undefined || salt === undefined
      ? undefined
      : {
          firstName: record.firstName,
          access: record.access,
          credential: { salt, verifier: record.verifier },
        };
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
    const access = this.roleAccess(userId, row.is_administrator);
    return {
      firstName: row.first_name,
      salt: row.salt,
      verifier: row.verifier,
      access,
    };
  }

  activePerson(userId: string): ActivePerson | undefined {
    return this.person(userId, "AND users.active = 1 AND users.removed = 0");
  }

  anyPerson(userId: string): ActivePerson | undefined {
    return this.person(userId, "");
  }

  private person(userId: string, condition: string): ActivePerson | undefined {
    const row = this.database
      .prepare<[string], { first_name: string; is_administrator: number | null }>(
        `SELECT users.first_name AS first_name, roles.is_administrator AS is_administrator
         FROM users
         LEFT JOIN roles ON roles.id = users.role_id AND roles.removed = 0
         WHERE users.id = ? ${condition}`,
      )
      .get(userId);
    return row === undefined
      ? undefined
      : { firstName: row.first_name, access: this.roleAccess(userId, row.is_administrator) };
  }

  private roleAccess(userId: string, isAdministrator: number | null): RoleAccess {
    const permissionKeys =
      isAdministrator === null
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
    return { isAdministrator: isAdministrator === 1, permissionKeys };
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
