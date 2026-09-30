import { argon2, randomBytes } from "node:crypto";
import type { SyncChange } from "@purosur/contracts";
import { encodePinHash, type PermissionKey, PIN_HASH_SCHEME } from "@purosur/domain";

type WithoutChangeSeq<TChange> = TChange extends SyncChange ? Omit<TChange, "change_seq"> : never;

export type CloudChange = WithoutChangeSeq<SyncChange>;

export function registerChange(register: { id: string; name: string }): CloudChange {
  return {
    entity: "register",
    entity_id: register.id,
    row: { name: register.name, version: 1 },
  };
}

export function roleChange(role: {
  id: string;
  name: string;
  permissionKeys: readonly PermissionKey[];
}): CloudChange {
  return {
    entity: "role",
    entity_id: role.id,
    row: {
      name: role.name,
      is_administrator: false,
      permission_keys: [...role.permissionKeys],
      version: 1,
    },
  };
}

function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: pin,
        nonce: salt,
        parallelism: PIN_HASH_SCHEME.parallelism,
        passes: PIN_HASH_SCHEME.passes,
        memory: PIN_HASH_SCHEME.memoryKiB,
        tagLength: PIN_HASH_SCHEME.hashLength,
      },
      (error, hash) => (error ? reject(error) : resolve(encodePinHash(hash))),
    );
  });
}

export async function pinRecord(pin: string): Promise<{ salt: string; pin_hash: string }> {
  const salt = randomBytes(PIN_HASH_SCHEME.saltLength);
  return { salt: encodePinHash(salt), pin_hash: await hashPin(pin, salt) };
}

export async function userChange(user: {
  id: string;
  firstName: string;
  roleId: string;
  pin?: string;
}): Promise<CloudChange> {
  const record =
    user.pin === undefined ? { salt: null, pin_hash: null } : await pinRecord(user.pin);
  return {
    entity: "user",
    entity_id: user.id,
    row: {
      first_name: user.firstName,
      role_id: user.roleId,
      ...record,
      active: true,
      version: 1,
    },
  };
}
