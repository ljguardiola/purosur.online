import { createDecipheriv } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  type ContingencyBackupTicketPart,
  contingencyBackupTicketAssociatedData,
  contingencyBackupTicketContentSchema,
  joinContingencyBackupTicketParts,
  readContingencyBackupTicketQrCode,
} from "@purosur/contracts";
import type { ContingencyBackupTicketOpening } from "@purosur/domain/backups/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerContingencyTicketKeys, registers } from "../platform/db/schema.js";
import { contingencyTicketKeyPurpose } from "../register/drizzle-register-store.js";
import type { InstallationKeyCipher } from "../register/installation-key-cipher.js";

const AUTH_TAG_BYTES = 16;
const MAX_TICKET_BYTES = 16 * 1024 * 1024;

export class DrizzleContingencyBackupTicketOpener<TQueryResult extends PgQueryResultHKT> {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;

  constructor(db: PgDatabase<TQueryResult>, cipher: InstallationKeyCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  async open(qrCodes: readonly string[]): Promise<ContingencyBackupTicketOpening> {
    const parts: ContingencyBackupTicketPart[] = [];
    for (const qrCode of qrCodes) {
      const part = readContingencyBackupTicketQrCode(qrCode);
      if (part === null) {
        return { kind: "unreadable" };
      }
      parts.push(part);
    }
    const [first] = parts;
    const sealed = joinContingencyBackupTicketParts(parts);
    if (first === undefined || sealed === null) {
      return { kind: "incomplete" };
    }

    const [row] = await this.db
      .select({ key: registerContingencyTicketKeys.key, registerName: registers.name })
      .from(registerContingencyTicketKeys)
      .innerJoin(registers, eq(registers.id, registerContingencyTicketKeys.registerId))
      .where(
        and(
          eq(registerContingencyTicketKeys.registerId, first.registerId),
          eq(registerContingencyTicketKeys.version, first.keyVersion),
        ),
      );
    if (row === undefined) {
      return { kind: "unknown_key" };
    }
    const key = this.cipher.open(
      row.key,
      contingencyTicketKeyPurpose(first.registerId, first.keyVersion),
    );

    const content = contentOf(sealed, key, first);
    if (content === null || content.register_id !== first.registerId) {
      return { kind: "not_authentic" };
    }
    return {
      kind: "opened",
      registerId: first.registerId,
      registerName: row.registerName,
      content: { deviceId: content.device_id, events: content.events },
    };
  }
}

function contentOf(sealed: Uint8Array, key: string, header: ContingencyBackupTicketPart) {
  if (sealed.length < AUTH_TAG_BYTES) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), header.nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(contingencyBackupTicketAssociatedData(header));
    decipher.setAuthTag(sealed.subarray(sealed.length - AUTH_TAG_BYTES));
    const compressed = Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - AUTH_TAG_BYTES)),
      decipher.final(),
    ]);
    const parsed = contingencyBackupTicketContentSchema.safeParse(
      JSON.parse(
        inflateRawSync(compressed, { maxOutputLength: MAX_TICKET_BYTES }).toString("utf8"),
      ),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
