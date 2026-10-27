import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  type ContingencyBackupTicketContent,
  contingencyBackupTicketAssociatedData,
  contingencyBackupTicketQrCodes,
} from "@purosur/contracts";

export type TicketEvent = ContingencyBackupTicketContent["events"][number];

export function ticketEvent(deviceSeq: number, overrides: Partial<TicketEvent> = {}): TicketEvent {
  return {
    event_id: randomUUID(),
    device_seq: deviceSeq,
    aggregate_type: "Sale",
    aggregate_id: randomUUID(),
    event_type: "sale_opened",
    schema_version: 1,
    payload: {},
    occurred_at: "2026-10-01T10:00:00.000Z",
    actor_id: randomUUID(),
    chain_hmac: `link-${deviceSeq}`,
    ...overrides,
  };
}

export function ticketContent(
  registerId: string,
  deviceId: string,
  events: TicketEvent[],
): ContingencyBackupTicketContent {
  return { format: 1, register_id: registerId, device_id: deviceId, app_version: "1.4.0", events };
}

export function generatedKey(): string {
  return randomBytes(32).toString("base64");
}

export function sealedTicketQrCodes({
  content,
  ...frame
}: {
  frameRegisterId: string;
  keyVersion: number;
  key: string;
  content: unknown;
}): string[] {
  return sealedPlaintextQrCodes({
    ...frame,
    plaintext: deflateRawSync(JSON.stringify(content)),
  });
}

export function sealedPlaintextQrCodes({
  frameRegisterId,
  keyVersion,
  key,
  plaintext,
}: {
  frameRegisterId: string;
  keyVersion: number;
  key: string;
  plaintext: Buffer;
}): string[] {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), nonce);
  cipher.setAAD(
    contingencyBackupTicketAssociatedData({ registerId: frameRegisterId, keyVersion, nonce }),
  );
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return contingencyBackupTicketQrCodes({
    registerId: frameRegisterId,
    keyVersion,
    nonce,
    sealed,
  });
}
