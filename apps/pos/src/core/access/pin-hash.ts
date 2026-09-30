import { argon2 } from "node:crypto";
import { encodePinHash, PIN_HASH_SCHEME } from "@purosur/domain";

export function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: pin,
        nonce: salt,
        memory: PIN_HASH_SCHEME.memoryKiB,
        passes: PIN_HASH_SCHEME.passes,
        parallelism: PIN_HASH_SCHEME.parallelism,
        tagLength: PIN_HASH_SCHEME.hashLength,
      },
      (error, hash) => {
        if (error === null) {
          resolve(encodePinHash(hash));
        } else {
          reject(error);
        }
      },
    );
  });
}
