import { encodePinHash, PIN_HASH_SCHEME } from "@purosur/contracts";
import { argon2id } from "hash-wasm";

// Electron's Node is built on BoringSSL, which has no argon2, so node:crypto can't run it there.
export async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const hash = await argon2id({
    password: pin,
    salt,
    parallelism: PIN_HASH_SCHEME.parallelism,
    iterations: PIN_HASH_SCHEME.passes,
    memorySize: PIN_HASH_SCHEME.memoryKiB,
    hashLength: PIN_HASH_SCHEME.hashLength,
    outputType: "binary",
  });
  return encodePinHash(hash);
}
