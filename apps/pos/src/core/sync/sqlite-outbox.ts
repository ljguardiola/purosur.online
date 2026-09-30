import { createHmac } from "node:crypto";
import {
  canonicalOutboxEvent,
  canonicalOutboxPayload,
  type OutboxEventDraft,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

const CHAIN_LENGTH_BYTES = 32;

interface ChainPosition {
  last_device_seq: number;
  last_chain_hmac: string | null;
}

export function appendOutboxEvent(
  database: LocalDatabase,
  chainKey: string,
  draft: OutboxEventDraft,
): void {
  database.transaction(() => {
    const position = database
      .prepare<[], ChainPosition>("SELECT last_device_seq, last_chain_hmac FROM sync_state")
      .get();
    if (position === undefined) {
      throw new Error("the local database has no sync state");
    }
    const deviceSeq = position.last_device_seq + 1;
    const previousChain =
      position.last_chain_hmac === null
        ? Buffer.alloc(CHAIN_LENGTH_BYTES)
        : Buffer.from(position.last_chain_hmac, "base64");
    const chainHmac = createHmac("sha256", Buffer.from(chainKey, "base64"))
      .update(previousChain)
      .update(Buffer.from(canonicalOutboxEvent({ ...draft, device_seq: deviceSeq }), "utf8"))
      .digest("base64");

    database
      .prepare(
        `INSERT INTO outbox (
           event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
           payload, occurred_at, actor_id, chain_hmac
         ) VALUES (
           @event_id, @device_seq, @aggregate_type, @aggregate_id, @event_type, @schema_version,
           @payload, @occurred_at, @actor_id, @chain_hmac
         )`,
      )
      .run({
        ...draft,
        device_seq: deviceSeq,
        payload: canonicalOutboxPayload(draft.payload),
        chain_hmac: chainHmac,
      });
    database
      .prepare("UPDATE sync_state SET last_device_seq = ?, last_chain_hmac = ?")
      .run(deviceSeq, chainHmac);
  })();
}
