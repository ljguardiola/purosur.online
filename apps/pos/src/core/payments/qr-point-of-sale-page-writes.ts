import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import { type PageWriteMode, versionAccepted } from "../sync/page-write-mode";

export function prepareQrPointOfSalePageWrites(database: LocalDatabase, mode: PageWriteMode) {
  const saveAssignment = database.prepare(
    `INSERT INTO register_qr_point_of_sale (register_id, assigned, version)
     VALUES (@register_id, @assigned, @version)
     ON CONFLICT (register_id) DO UPDATE SET assigned = excluded.assigned, version = excluded.version
     WHERE excluded.version ${versionAccepted(mode)} register_qr_point_of_sale.version`,
  );

  return {
    assignment({
      entity_id,
      row,
    }: Extract<SyncChange, { entity: "register_qr_point_of_sale" }>): void {
      saveAssignment.run({
        register_id: entity_id,
        assigned: row.assigned ? 1 : 0,
        version: row.version,
      });
    },
  };
}
