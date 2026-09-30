export const PIN_HASH_SCHEME = {
  algorithm: "argon2id",
  memory: 19456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
  encoding: "base64url",
} as const;
