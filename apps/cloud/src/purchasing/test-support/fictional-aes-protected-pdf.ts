import { createCipheriv, createHash, randomBytes } from "node:crypto";

const PASSWORD_PADDING = Buffer.from(
  "28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A",
  "hex",
);
const PERMISSIONS = -3904;
const OWNER_PASSWORD = "fictional-owner";
const ENCRYPTION_DICTIONARY = 6;
const OBJECT_STREAM = 7;
const CROSS_REFERENCE_STREAM = 8;

const latin1 = (text: string) => Buffer.from(text, "latin1");
const md5 = (...parts: Buffer[]) => createHash("md5").update(Buffer.concat(parts)).digest();
const padded = (password: string) =>
  Buffer.concat([latin1(password), PASSWORD_PADDING]).subarray(0, 32);

function rc4(key: Buffer, data: Buffer): Buffer {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + (state[i] as number) + (key[i % key.length] as number)) & 255;
    [state[i], state[j]] = [state[j] as number, state[i] as number];
  }
  const output = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let index = 0; index < data.length; index += 1) {
    i = (i + 1) & 255;
    j = (j + (state[i] as number)) & 255;
    [state[i], state[j]] = [state[j] as number, state[i] as number];
    const keyByte = state[((state[i] as number) + (state[j] as number)) & 255] as number;
    output[index] = (data[index] as number) ^ keyByte;
  }
  return output;
}

function rc4Twenty(key: Buffer, data: Buffer): Buffer {
  let output = rc4(key, data);
  for (let round = 1; round <= 19; round += 1) {
    output = rc4(Buffer.from(key.map((byte) => byte ^ round)), output);
  }
  return output;
}

function md5FiftyMoreTimes(digest: Buffer): Buffer {
  let result = digest;
  for (let round = 0; round < 50; round += 1) {
    result = md5(result);
  }
  return result;
}

function standardSecurity(documentId: Buffer) {
  const owner = rc4Twenty(md5FiftyMoreTimes(md5(padded(OWNER_PASSWORD))), padded(""));
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(PERMISSIONS);
  const fileKey = md5FiftyMoreTimes(md5(padded(""), owner, permissions, documentId));
  const user = Buffer.concat([
    rc4Twenty(fileKey, md5(PASSWORD_PADDING, documentId)),
    Buffer.alloc(16),
  ]);
  return { owner, user, fileKey };
}

function aesEncrypted(fileKey: Buffer, objectNumber: number, data: Buffer): Buffer {
  const objectKey = md5(
    fileKey,
    Buffer.from([objectNumber & 255, (objectNumber >> 8) & 255, (objectNumber >> 16) & 255, 0, 0]),
    latin1("sAlT"),
  );
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", objectKey, iv);
  return Buffer.concat([iv, cipher.update(data), cipher.final()]);
}

function objectStreamOf(objects: [number, string][]): { header: string; data: Buffer } {
  let body = "";
  const offsets: string[] = [];
  for (const [number, object] of objects) {
    offsets.push(`${number} ${body.length}`);
    body += `${object}\n`;
  }
  const header = `${offsets.join(" ")}\n`;
  return { header, data: latin1(header + body) };
}

const CATALOG: [number, string] = [1, "<< /Type /Catalog /Pages 2 0 R >>"];
const PAGE_TREE_ROOT: [number, string] = [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"];

export function fictionalAesProtectedPdfWithPagesInAnObjectStream({
  plainCatalogAndPageTreeRoot = false,
}: {
  plainCatalogAndPageTreeRoot?: boolean;
} = {}): Uint8Array {
  const documentId = randomBytes(16);
  const { owner, user, fileKey } = standardSecurity(documentId);
  const plainObjects = plainCatalogAndPageTreeRoot ? [CATALOG, PAGE_TREE_ROOT] : [];
  const compressedObjects: [number, string][] = [
    ...(plainCatalogAndPageTreeRoot ? [] : [CATALOG, PAGE_TREE_ROOT]),
    [
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ],
    [4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
  ];
  const objectStream = objectStreamOf(compressedObjects);
  const pageContent = latin1(
    "BT /F1 14 Tf 20 250 Td (Distribuidora Ficticia - Yerba 1 kg 4500,00) Tj ET\n",
  );

  const parts: Buffer[] = [latin1("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n")];
  const offsets = new Map<number, number>();
  const written = () => parts.reduce((length, part) => length + part.length, 0);
  const addStream = (number: number, dictionary: string, data: Buffer) => {
    offsets.set(number, written());
    parts.push(
      latin1(`${number} 0 obj\n<< ${dictionary}/Length ${data.length} >>\nstream\n`),
      data,
      latin1("\nendstream\nendobj\n"),
    );
  };

  for (const [number, object] of plainObjects) {
    offsets.set(number, written());
    parts.push(latin1(`${number} 0 obj\n${object}\nendobj\n`));
  }
  addStream(5, "", aesEncrypted(fileKey, 5, pageContent));
  addStream(
    OBJECT_STREAM,
    `/Type /ObjStm /N ${compressedObjects.length} /First ${objectStream.header.length} `,
    aesEncrypted(fileKey, OBJECT_STREAM, objectStream.data),
  );
  offsets.set(ENCRYPTION_DICTIONARY, written());
  parts.push(
    latin1(
      `${ENCRYPTION_DICTIONARY} 0 obj\n<< /Filter /Standard /V 4 /R 4 /Length 128 /P ${PERMISSIONS} /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /CF << /StdCF << /CFM /AESV2 /AuthEvent /DocOpen /Length 16 >> >> /StmF /StdCF /StrF /StdCF >>\nendobj\n`,
    ),
  );

  const crossReferenceOffset = written();
  offsets.set(CROSS_REFERENCE_STREAM, crossReferenceOffset);
  const entries = Array.from({ length: CROSS_REFERENCE_STREAM + 1 }, (_, number) => {
    const entry = Buffer.alloc(7);
    const indexInStream = compressedObjects.findIndex(([compressed]) => compressed === number);
    const offset = offsets.get(number);
    if (indexInStream >= 0) {
      entry[0] = 2;
      entry.writeUInt32BE(OBJECT_STREAM, 1);
      entry.writeUInt16BE(indexInStream, 5);
    } else if (offset !== undefined) {
      entry[0] = 1;
      entry.writeUInt32BE(offset, 1);
    } else if (number === 0) {
      entry.writeUInt16BE(65535, 5);
    }
    return entry;
  });
  const id = documentId.toString("hex");
  addStream(
    CROSS_REFERENCE_STREAM,
    `/Type /XRef /Size ${CROSS_REFERENCE_STREAM + 1} /W [1 4 2] /Root 1 0 R /Encrypt ${ENCRYPTION_DICTIONARY} 0 R /ID [<${id}> <${id}>] `,
    Buffer.concat(entries),
  );
  parts.push(latin1(`startxref\n${crossReferenceOffset}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}
