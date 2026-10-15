import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const NONCE_BYTES = 12;
const LENGTH_PREFIX_BYTES = 4;

export interface SnapshotIdentity {
  registerId: string;
  keyVersion: number;
  generationId: string;
}

export function snapshotAssociatedData({
  registerId,
  keyVersion,
  generationId,
}: SnapshotIdentity): Buffer {
  return Buffer.concat(
    [registerId, String(keyVersion), generationId].map((field) => {
      const bytes = Buffer.from(field, "utf8");
      const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  );
}

export function snapshotKeyBytes(encodedKey: string): Buffer {
  return Buffer.from(encodedKey, "base64");
}

export async function encryptSnapshotFile({
  sourcePath,
  targetPath,
  key,
  associatedData,
}: {
  sourcePath: string;
  targetPath: string;
  key: Buffer;
  associatedData: Buffer;
}): Promise<{ size: number; sha256: string }> {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData);
  const hash = createHash("sha256");

  async function* encryptedObject(): AsyncGenerator<Buffer> {
    const emitted = (chunk: Buffer): Buffer => {
      hash.update(chunk);
      return chunk;
    };
    yield emitted(nonce);
    for await (const chunk of createReadStream(sourcePath)) {
      yield emitted(cipher.update(chunk as Buffer));
    }
    yield emitted(cipher.final());
    yield emitted(cipher.getAuthTag());
  }

  await pipeline(encryptedObject, createWriteStream(targetPath));
  return { size: (await stat(targetPath)).size, sha256: hash.digest("hex") };
}
