import { createCipheriv, randomBytes } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  contingencyBackupTicketAssociatedData,
  contingencyBackupTicketContentSchema,
  contingencyBackupTicketQrCodes,
} from "@purosur/contracts";
import type { OperationEventRange } from "@purosur/domain";
import type {
  ContingencyBackupTicketSealer,
  ContingencyBackupTicketSealing,
} from "@purosur/domain/backups/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";

const NONCE_BYTES = 12;

export interface ContingencyBackupTicketSealingDeps {
  database: LocalDatabase;
  outbox: Pick<SqliteLocalOutbox, "eventsInRange">;
  readContingencyTicketKey: () => Promise<{ version: number; key: string } | undefined>;
  appVersion: string | undefined;
}

interface InstallationRow {
  register_id: string;
  device_id: string;
}

function installation(database: LocalDatabase): InstallationRow {
  const row = database
    .prepare<[], InstallationRow>(
      `SELECT own_register.id AS register_id, sync_state.device_id AS device_id
         FROM own_register, sync_state
        WHERE own_register.removed = 0 AND sync_state.device_id IS NOT NULL`,
    )
    .get();
  if (row === undefined) {
    throw new Error("the register holds no installation to seal a ticket for");
  }
  return row;
}

export function createContingencyBackupTicketSealer({
  database,
  outbox,
  readContingencyTicketKey,
  appVersion,
}: ContingencyBackupTicketSealingDeps): ContingencyBackupTicketSealer {
  return {
    async seal(
      _ticketId: string,
      { firstDeviceSeq, lastDeviceSeq }: OperationEventRange,
    ): Promise<ContingencyBackupTicketSealing> {
      const key = await readContingencyTicketKey();
      if (key === undefined) return { kind: "no_key" };
      if (appVersion === undefined) {
        throw new Error("the register's version is unknown, so no ticket can be sealed");
      }
      const { register_id, device_id } = installation(database);
      const content = contingencyBackupTicketContentSchema.parse({
        format: 1,
        register_id,
        device_id,
        app_version: appVersion,
        events: await outbox.eventsInRange(firstDeviceSeq, lastDeviceSeq),
      });

      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(key.key, "base64"), nonce);
      cipher.setAAD(
        contingencyBackupTicketAssociatedData({
          registerId: register_id,
          keyVersion: key.version,
          nonce,
        }),
      );
      const sealed = Buffer.concat([
        cipher.update(deflateRawSync(JSON.stringify(content))),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      return {
        kind: "sealed",
        keyVersion: key.version,
        qrCodes: contingencyBackupTicketQrCodes({
          registerId: register_id,
          keyVersion: key.version,
          nonce,
          sealed,
        }),
      };
    },
  };
}
