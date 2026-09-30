import { argon2, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { PIN_HASH_SCHEME } from "@purosur/domain";
import type { PinHasher } from "@purosur/domain/access/use-cases";

const deriveArgon2 = promisify(argon2);

export function argon2PinHasher(newSalt: (length: number) => Buffer = randomBytes): PinHasher {
  return {
    async hash(pin) {
      const salt = newSalt(PIN_HASH_SCHEME.saltLength);
      const tag = await deriveArgon2(PIN_HASH_SCHEME.algorithm, {
        message: pin,
        nonce: salt,
        memory: PIN_HASH_SCHEME.memory,
        passes: PIN_HASH_SCHEME.passes,
        parallelism: PIN_HASH_SCHEME.parallelism,
        tagLength: PIN_HASH_SCHEME.tagLength,
      });
      return {
        salt: salt.toString(PIN_HASH_SCHEME.encoding),
        pinHash: tag.toString(PIN_HASH_SCHEME.encoding),
      };
    },
  };
}
