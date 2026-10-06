import { describe, expect, it } from "vitest";
import { hmacEventChain } from "./hmac-event-chain.js";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

const FIRST_CANONICAL =
  '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":1,"event_id":"018f0000-0000-7000-8000-000000000001","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_by":"u1","opening_float":5000},"schema_version":1}';

const SECOND_CANONICAL =
  '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":2,"event_id":"018f0000-0000-7000-8000-000000000002","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_by":"u1","opening_float":5000},"schema_version":1}';

const FIRST_LINK = "OymB3viQoTt/FZJzCVWyQn+LaV7S4+n9New7I9P3Njg=";
const SECOND_LINK = "gVbvVZIeSFEu11rEXwMHik5+fqq30deItMhUCt2MO8Q=";

describe("the HMAC chain of a register's outbox events", () => {
  it("links an installation's first event from the origin as the register does", () => {
    expect(hmacEventChain.link(CHAIN_KEY, null, FIRST_CANONICAL)).toBe(FIRST_LINK);
  });

  it("links an event from the link before it as the register does", () => {
    expect(hmacEventChain.link(CHAIN_KEY, FIRST_LINK, SECOND_CANONICAL)).toBe(SECOND_LINK);
  });

  it("links the same event differently under another key", () => {
    const otherKey = Buffer.from("fedcba9876543210fedcba9876543210").toString("base64");

    expect(hmacEventChain.link(otherKey, null, FIRST_CANONICAL)).not.toBe(FIRST_LINK);
  });
});
