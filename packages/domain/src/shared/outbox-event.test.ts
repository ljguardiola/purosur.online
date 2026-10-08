import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canonicalOutboxEvent,
  canonicalOutboxPayload,
  type JsonValue,
  type OutboxEvent,
} from "./outbox-event.js";

const EVENT: OutboxEvent = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 7,
  aggregate_type: "CashSession",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "cash_session_opened",
  schema_version: 1,
  payload: { opening_float: 150000, opened_by: "user-1", opened_at: "2026-09-30T12:00:00.000Z" },
  occurred_at: "2026-09-30T12:00:00.000Z",
  actor_id: "user-1",
};

function withPayload(payload: JsonValue): string {
  return canonicalOutboxEvent({ ...EVENT, payload: { value: payload } });
}

function withPayloadOutsideTheType(value: bigint | undefined): string {
  const payload: OutboxEvent["payload"] = {};
  Object.defineProperty(payload, "value", { value, enumerable: true });
  return canonicalOutboxEvent({ ...EVENT, payload });
}

const jsonValue = fc.letrec<{ value: JsonValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string(),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(fc.string(), tie("value"), { maxKeys: 4 }),
  ),
})).value;

function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

describe("canonicalOutboxEvent", () => {
  it("writes the members sorted by name with no whitespace", () => {
    expect(canonicalOutboxEvent(EVENT)).toBe(
      '{"actor_id":"user-1","aggregate_id":"0199b7a0-0000-7000-8000-000000000002","aggregate_type":"CashSession","device_seq":7,"event_id":"0199b7a0-0000-7000-8000-000000000001","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_at":"2026-09-30T12:00:00.000Z","opened_by":"user-1","opening_float":150000},"schema_version":1}',
    );
  });

  it("sorts member names by UTF-16 code units, not by code points", () => {
    const payload = { "\ufb33": 1, "\u{1f600}": 2, "\u20ac": 3, "\r": 4, "1": 5, "\u0080": 6 };

    expect(withPayload(payload)).toContain(
      '"payload":{"value":{"\\r":4,"1":5,"\u0080":6,"\u20ac":3,"\u{1f600}":2,"\ufb33":1}}',
    );
  });

  it("escapes strings the way JSON does", () => {
    expect(withPayload('a"b\\c\n\t\b\f\r\u0001\u007f/ü')).toContain(
      '"value":"a\\"b\\\\c\\n\\t\\b\\f\\r\\u0001\u007f/ü"',
    );
  });

  it("keeps arrays in order and writes null and booleans as literals", () => {
    expect(withPayload([3, null, true, false, [], {}])).toContain(
      '"value":[3,null,true,false,[],{}]',
    );
  });

  it("writes an integer without an exponent or a fraction, and negative zero as zero", () => {
    expect(withPayload([0, -0, -12, 123456789012])).toContain('"value":[0,0,-12,123456789012]');
    expect(withPayload(Number.MAX_SAFE_INTEGER)).toContain(`"value":${Number.MAX_SAFE_INTEGER}`);
  });

  it.each([
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["an integer beyond the safe range", Number.MAX_SAFE_INTEGER + 1],
  ])("refuses a number that is %s", (_name, value) => {
    expect(() => withPayload(value)).toThrow(/number/);
  });

  it("refuses a value JSON cannot hold", () => {
    expect(() => withPayloadOutsideTheType(undefined)).toThrow(/cannot be canonicalized/);
    expect(() => withPayloadOutsideTheType(10n)).toThrow(/cannot be canonicalized/);
  });

  it("serializes exactly the fields it is given", () => {
    const { device_seq: _seq, ...withoutSeq } = EVENT;

    expect(canonicalOutboxEvent(withoutSeq as OutboxEvent)).not.toContain("device_seq");
  });

  it("reads back as the value it was made from, whatever the value", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        expect(JSON.parse(withPayload(value))).toEqual({ ...EVENT, payload: { value } });
      }),
    );
  });

  it("is the same whatever order the members were added in", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), jsonValue, { maxKeys: 6 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (payload, seed) => {
          const reordered = Object.fromEntries(shuffled(Object.entries(payload), seed));

          expect(canonicalOutboxEvent({ ...EVENT, payload: reordered })).toBe(
            canonicalOutboxEvent({ ...EVENT, payload }),
          );
        },
      ),
    );
  });
});

describe("canonicalOutboxPayload", () => {
  it("writes the payload exactly as it appears inside the canonical event", () => {
    expect(canonicalOutboxPayload(EVENT.payload)).toBe(
      '{"opened_at":"2026-09-30T12:00:00.000Z","opened_by":"user-1","opening_float":150000}',
    );
    expect(canonicalOutboxEvent(EVENT)).toContain(
      `"payload":${canonicalOutboxPayload(EVENT.payload)}`,
    );
  });
});
