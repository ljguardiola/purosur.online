import { isPageAfter } from "../model/pull-page.js";
import type { CatchUpPorts, PulledChange } from "./sync-ports.js";

export type CatchUpOutcome<TFailure> =
  | { kind: "caught_up"; cursor: number }
  | { kind: "failed"; failure: TFailure; cursor: number }
  | { kind: "page_out_of_order"; cursor: number };

export async function catchUpWithCloud<TChange extends PulledChange, TFailure>({
  replica,
  feed,
}: CatchUpPorts<TChange, TFailure>): Promise<CatchUpOutcome<TFailure>> {
  let cursor = await replica.savedCursor();
  for (;;) {
    const answer = await feed.pageAfter(cursor);
    if (answer.kind === "failed") {
      return { kind: "failed", failure: answer.failure, cursor };
    }
    if (!isPageAfter(cursor, answer.page)) {
      return { kind: "page_out_of_order", cursor };
    }
    await replica.savePage(answer.page);
    cursor = answer.page.cursor;
    if (!answer.page.hasMore) {
      return { kind: "caught_up", cursor };
    }
  }
}
