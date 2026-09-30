import { createHash } from "node:crypto";

function sha256Of(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function asarArchive(files) {
  const root = { files: {} };
  const contents = [];
  let offset = 0;
  for (const [path, file] of Object.entries(files)) {
    const parts = path.split("/");
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      directory.files[part] ??= { files: {} };
      directory = directory.files[part];
    }
    const name = parts.at(-1);
    if (file.unpackedHash) {
      directory.files[name] = {
        size: 1,
        unpacked: true,
        integrity: { algorithm: "SHA256", hash: file.unpackedHash },
      };
      continue;
    }
    const content = Buffer.from(file.content);
    directory.files[name] = {
      size: content.length,
      offset: String(offset),
      integrity: { algorithm: "SHA256", hash: file.recordedHash ?? sha256Of(content) },
    };
    contents.push(content);
    offset += content.length;
  }
  const json = Buffer.from(JSON.stringify(root));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const header = Buffer.alloc(8 + paddedLength);
  header.writeUInt32LE(4 + paddedLength, 0);
  header.writeUInt32LE(json.length, 4);
  json.copy(header, 8);
  const headerSize = Buffer.alloc(8);
  headerSize.writeUInt32LE(4, 0);
  headerSize.writeUInt32LE(header.length, 4);
  return Buffer.concat([headerSize, header, ...contents]);
}
