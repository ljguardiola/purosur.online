import {
  COMPROMISE_RESPONSE_ITEMS,
  type CompromiseResponseCompletion,
  EXTERNAL_SECRET_ITEMS,
} from "../../model/compromise-response.js";
import type { StoredCompromiseResponse } from "../compromise-response-store.js";

export const STARTED_AT = new Date("2026-10-01T09:00:00.000Z");
export const AT = new Date("2026-10-01T12:00:00.000Z");
export const EARLIER = new Date("2026-10-01T10:00:00.000Z");

export const ACTION_COMPLETIONS: CompromiseResponseCompletion[] = [
  { key: "revoke_every_installation", at: EARLIER },
  { key: "end_sessions_and_remove_passkeys", at: EARLIER },
  { key: "force_pin_resets", at: EARLIER },
];

export const SECRET_COMPLETIONS: CompromiseResponseCompletion[] = EXTERNAL_SECRET_ITEMS.map(
  (key) => ({ key, at: EARLIER }),
);

export function response(
  completions: CompromiseResponseCompletion[] = [],
  id = "response-1",
): StoredCompromiseResponse {
  return { id, startedAt: STARTED_AT, startedBy: "admin-1", completions };
}

export const EVERY_ITEM_COMPLETION: CompromiseResponseCompletion[] = COMPROMISE_RESPONSE_ITEMS.map(
  (key) => ({ key, at: EARLIER }),
);
