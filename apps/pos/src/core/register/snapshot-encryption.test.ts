import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptSnapshotFile,
  snapshotAssociatedData,
  snapshotKeyBytes,
} from "./snapshot-encryption";
import { decryptSnapshotFile } from "./test-support/decrypt-snapshot";

const IDENTITY = {
  registerId: "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
  keyVersion: 2,
  generationId: "0f8fad5b-d9cb-469f-a165-70867728950e",
};
const KEY = Buffer.alloc(32, 9);

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-encryption-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function encrypted(plain: Buffer, associatedData = snapshotAssociatedData(IDENTITY)) {
  const sourcePath = join(folder, "plain.sqlite");
  const targetPath = join(folder, "object.snapshot");
  await writeFile(sourcePath, plain);
  const result = await encryptSnapshotFile({ sourcePath, targetPath, key: KEY, associatedData });
  return { result, targetPath };
}

describe("snapshotAssociatedData", () => {
  it("writes each field behind its length, so the fields cannot run into each other", () => {
    expect(
      snapshotAssociatedData({ registerId: "ab", keyVersion: 12, generationId: "c" }).toString(
        "hex",
      ),
    ).toBe(["00000002", "6162", "00000002", "3132", "00000001", "63"].join(""));
  });

  it("differs when a value moves from one field to the next", () => {
    const first = snapshotAssociatedData({ registerId: "ab", keyVersion: 1, generationId: "c" });
    const second = snapshotAssociatedData({ registerId: "a", keyVersion: 1, generationId: "bc" });

    expect(first.equals(second)).toBe(false);
  });

  it("differs when only the key version differs", () => {
    const first = snapshotAssociatedData(IDENTITY);
    const second = snapshotAssociatedData({ ...IDENTITY, keyVersion: 3 });

    expect(first.equals(second)).toBe(false);
  });
});

describe("snapshotKeyBytes", () => {
  it("decodes the installation key into its 32 bytes", () => {
    expect(snapshotKeyBytes(KEY.toString("base64")).equals(KEY)).toBe(true);
  });
});

describe("encryptSnapshotFile", () => {
  it("writes the nonce, then the ciphertext, then the tag", async () => {
    const plain = randomBytes(1000);

    const { targetPath } = await encrypted(plain);

    expect((await stat(targetPath)).size).toBe(12 + plain.length + 16);
  });

  it("gives back what was encrypted when opened with the same identity", async () => {
    const plain = randomBytes(3 * 1024 * 1024 + 17);
    const { targetPath } = await encrypted(plain);

    const opened = await decryptSnapshotFile(targetPath, KEY, snapshotAssociatedData(IDENTITY));

    expect(opened.equals(plain)).toBe(true);
  });

  it("encrypts an empty file", async () => {
    const { targetPath } = await encrypted(Buffer.alloc(0));

    const opened = await decryptSnapshotFile(targetPath, KEY, snapshotAssociatedData(IDENTITY));

    expect(opened.length).toBe(0);
  });

  it.each([
    ["register", { registerId: "11111111-1b0a-4f43-9a52-3c7d8e9f0a11" }],
    ["generation", { generationId: "11111111-d9cb-469f-a165-70867728950e" }],
    ["key version", { keyVersion: 3 }],
  ])("cannot be opened with another %s", async (_field, other) => {
    const { targetPath } = await encrypted(randomBytes(100));

    await expect(
      decryptSnapshotFile(targetPath, KEY, snapshotAssociatedData({ ...IDENTITY, ...other })),
    ).rejects.toThrow();
  });

  it("cannot be opened with another key", async () => {
    const { targetPath } = await encrypted(randomBytes(100));

    await expect(
      decryptSnapshotFile(targetPath, Buffer.alloc(32, 1), snapshotAssociatedData(IDENTITY)),
    ).rejects.toThrow();
  });

  it("cannot be opened once a byte has changed", async () => {
    const { targetPath } = await encrypted(randomBytes(100));
    const object = await readFile(targetPath);
    object[40] = (object[40] ?? 0) ^ 1;
    await writeFile(targetPath, object);

    await expect(
      decryptSnapshotFile(targetPath, KEY, snapshotAssociatedData(IDENTITY)),
    ).rejects.toThrow();
  });

  it("uses a different nonce every time", async () => {
    const plain = randomBytes(100);
    const first = await encrypted(plain);
    const firstObject = await readFile(first.targetPath);
    const second = await encrypted(plain);
    const secondObject = await readFile(second.targetPath);

    expect(firstObject.subarray(0, 12).equals(secondObject.subarray(0, 12))).toBe(false);
  });

  it("reports the size and the SHA-256 of the encrypted object", async () => {
    const { result, targetPath } = await encrypted(randomBytes(5000));

    const object = await readFile(targetPath);
    expect(result).toEqual({
      size: object.length,
      sha256: createHash("sha256").update(object).digest("hex"),
    });
  });
});
