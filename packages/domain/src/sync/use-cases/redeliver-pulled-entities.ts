import { isPageAfter } from "../model/pull-page.js";
import type { PulledChange, PulledEntity, RedeliveryPorts } from "./sync-ports.js";

export type RedeliveryOutcome<TFailure> =
  | { kind: "redelivered" }
  | { kind: "failed"; entity: PulledEntity; failure: TFailure; cursor: number }
  | { kind: "page_out_of_order"; entity: PulledEntity; cursor: number };

export async function redeliverPulledEntities<TChange extends PulledChange, TFailure>({
  replica,
  feed,
}: RedeliveryPorts<TChange, TFailure>): Promise<RedeliveryOutcome<TFailure>> {
  for (const pending of await replica.pendingRedeliveries()) {
    let cursor = pending.cursor;
    for (;;) {
      const answer = await feed.pageOfEntityAfter(pending.entity, cursor);
      if (answer.kind === "failed") {
        return { kind: "failed", entity: pending.entity, failure: answer.failure, cursor };
      }
      if (!isPageAfter(cursor, answer.page)) {
        return { kind: "page_out_of_order", entity: pending.entity, cursor };
      }
      await replica.saveRedeliveredPage(pending.entity, answer.page);
      cursor = answer.page.cursor;
      if (!answer.page.hasMore) {
        break;
      }
    }
    await replica.finishRedelivery(pending.entity);
  }
  return { kind: "redelivered" };
}
