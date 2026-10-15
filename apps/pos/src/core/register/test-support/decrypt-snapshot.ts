import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export async function decryptSnapshotFile(
  path: string,
  key: Buffer,
  associatedData: Buffer,
): Promise<Buffer> {
  const object = await readFile(path);
  const decipher = createDecipheriv("aes-256-gcm", key, object.subarray(0, NONCE_BYTES));
  decipher.setAAD(associatedData);
  decipher.setAuthTag(object.subarray(object.length - TAG_BYTES));
  return Buffer.concat([
    decipher.update(object.subarray(NONCE_BYTES, object.length - TAG_BYTES)),
    decipher.final(),
  ]);
}
