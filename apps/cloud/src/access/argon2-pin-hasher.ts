import { argon2, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { encodePinHash, PIN_HASH_SCHEME } from "@purosur/contracts";
import type { PinHasher } from "@purosur/domain/access/use-cases";

const deriveArgon2 = promisify(argon2);

export function argon2PinHasher(newSalt: (length: number) => Buffer = randomBytes): PinHasher {
  return {
    async hash(pin) {
      const salt = newSalt(PIN_HASH_SCHEME.saltLength);
      const tag = await deriveArgon2("argon2id", {
        message: pin,
        nonce: salt,
        memory: PIN_HASH_SCHEME.memoryKiB,
        passes: PIN_HASH_SCHEME.passes,
        parallelism: PIN_HASH_SCHEME.parallelism,
        tagLength: PIN_HASH_SCHEME.hashLength,
      });
      return {
        salt: encodePinHash(salt),
        pinHash: encodePinHash(tag),
      };
    },
  };
}
