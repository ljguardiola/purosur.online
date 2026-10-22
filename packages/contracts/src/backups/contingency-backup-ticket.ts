import { z } from "zod";
import { pushedEventSchema, recordIdSchema } from "../shared/index.js";
import { base45Decode, base45Encode } from "./base45.js";

export const contingencyBackupTicketContentSchema = z.object({
  format: z.literal(1),
  register_id: recordIdSchema(),
  device_id: z.string().min(1),
  app_version: z.string().min(1),
  events: z.array(pushedEventSchema).min(1),
});

export type ContingencyBackupTicketContent = z.output<typeof contingencyBackupTicketContentSchema>;

export const CONTINGENCY_BACKUP_QR_MAX_BYTES = 640;

const FRAME_FORMAT = 1;
const REGISTER_ID_BYTES = 16;
const KEY_VERSION_BYTES = 4;
const NONCE_BYTES = 12;
const ASSOCIATED_DATA_BYTES = 1 + REGISTER_ID_BYTES + KEY_VERSION_BYTES + NONCE_BYTES;
const HEADER_BYTES = ASSOCIATED_DATA_BYTES + 2;
const MAX_CHUNK_BYTES = CONTINGENCY_BACKUP_QR_MAX_BYTES - HEADER_BYTES;
const MAX_PARTS = 255;
const MAX_KEY_VERSION = 0xffffffff;

export interface ContingencyBackupTicketHeader {
  registerId: string;
  keyVersion: number;
  nonce: Uint8Array;
}

export interface ContingencyBackupTicketPart extends ContingencyBackupTicketHeader {
  partIndex: number;
  partCount: number;
  chunk: Uint8Array;
}

function registerIdBytes(registerId: string): Uint8Array {
  if (!recordIdSchema().safeParse(registerId).success) {
    throw new RangeError("the register id must be a uuid");
  }
  const hex = registerId.replaceAll("-", "");
  return Uint8Array.from({ length: REGISTER_ID_BYTES }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function registerIdText(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function contingencyBackupTicketAssociatedData({
  registerId,
  keyVersion,
  nonce,
}: ContingencyBackupTicketHeader): Uint8Array {
  if (!Number.isInteger(keyVersion) || keyVersion < 0 || keyVersion > MAX_KEY_VERSION) {
    throw new RangeError("the key version must fit in 32 bits");
  }
  if (nonce.length !== NONCE_BYTES) {
    throw new RangeError(`the nonce must be ${NONCE_BYTES} bytes`);
  }
  const data = new Uint8Array(ASSOCIATED_DATA_BYTES);
  data[0] = FRAME_FORMAT;
  data.set(registerIdBytes(registerId), 1);
  new DataView(data.buffer).setUint32(1 + REGISTER_ID_BYTES, keyVersion);
  data.set(nonce, 1 + REGISTER_ID_BYTES + KEY_VERSION_BYTES);
  return data;
}

export function contingencyBackupTicketQrCodes({
  sealed,
  ...header
}: ContingencyBackupTicketHeader & { sealed: Uint8Array }): string[] {
  const associatedData = contingencyBackupTicketAssociatedData(header);
  const partCount = Math.max(1, Math.ceil(sealed.length / MAX_CHUNK_BYTES));
  if (partCount > MAX_PARTS) {
    throw new RangeError("the sealed ticket needs more QR codes than a frame can number");
  }
  return Array.from({ length: partCount }, (_, index) => {
    const chunk = sealed.slice(index * MAX_CHUNK_BYTES, (index + 1) * MAX_CHUNK_BYTES);
    const frame = new Uint8Array(HEADER_BYTES + chunk.length);
    frame.set(associatedData, 0);
    frame[ASSOCIATED_DATA_BYTES] = index + 1;
    frame[ASSOCIATED_DATA_BYTES + 1] = partCount;
    frame.set(chunk, HEADER_BYTES);
    return base45Encode(frame);
  });
}

export function readContingencyBackupTicketQrCode(
  text: string,
): ContingencyBackupTicketPart | null {
  const frame = base45Decode(text);
  if (frame === null || frame[0] !== FRAME_FORMAT) return null;
  const partIndex = frame[ASSOCIATED_DATA_BYTES] ?? 0;
  const partCount = frame[ASSOCIATED_DATA_BYTES + 1] ?? 0;
  if (partIndex < 1 || partIndex > partCount) return null;
  return {
    registerId: registerIdText(frame.slice(1, 1 + REGISTER_ID_BYTES)),
    keyVersion: new DataView(frame.buffer, frame.byteOffset).getUint32(1 + REGISTER_ID_BYTES),
    nonce: frame.slice(1 + REGISTER_ID_BYTES + KEY_VERSION_BYTES, ASSOCIATED_DATA_BYTES),
    partIndex,
    partCount,
    chunk: frame.slice(HEADER_BYTES),
  };
}

export function joinContingencyBackupTicketParts(
  parts: readonly ContingencyBackupTicketPart[],
): Uint8Array | null {
  const [first] = parts;
  if (first === undefined) return null;
  const ordered = new Array<ContingencyBackupTicketPart | undefined>(first.partCount);
  for (const part of parts) {
    const sameTicket =
      part.registerId === first.registerId &&
      part.keyVersion === first.keyVersion &&
      part.partCount === first.partCount &&
      part.nonce.length === first.nonce.length &&
      part.nonce.every((byte, index) => byte === first.nonce[index]);
    if (!sameTicket || ordered[part.partIndex - 1] !== undefined) return null;
    ordered[part.partIndex - 1] = part;
  }
  const chunks: Uint8Array[] = [];
  for (const part of ordered) {
    if (part === undefined) return null;
    chunks.push(part.chunk);
  }
  const joined = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}
