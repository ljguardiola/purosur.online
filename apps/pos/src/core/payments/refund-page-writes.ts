import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";

export function prepareRefundPageWrites(database: LocalDatabase) {
  const saveCompletion = database.prepare(
    `INSERT INTO refund_completions (refund_id, done_by, done_at)
     VALUES (@refund_id, @done_by, @done_at)
     ON CONFLICT (refund_id) DO NOTHING`,
  );
  return {
    completion(change: Extract<SyncChange, { entity: "refund_completion" }>): void {
      saveCompletion.run({
        refund_id: change.entity_id,
        done_by: change.row.done_by,
        done_at: change.row.done_at,
      });
    },
  };
}
