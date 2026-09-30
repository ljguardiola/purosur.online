export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [member: string]: JsonValue };

export type OutboxEvent = {
  event_id: string;
  device_seq: number;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: { [member: string]: JsonValue };
  occurred_at: string;
  actor_id: string;
};

export type OutboxEventDraft = Omit<OutboxEvent, "device_seq">;

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`number ${value} is not a safe integer`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const members = Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${canonicalJson(value[name] as JsonValue)}`);
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`a ${typeof value} cannot be canonicalized`);
}

export function canonicalOutboxEvent(event: OutboxEvent): string {
  return canonicalJson(event);
}

export function canonicalOutboxPayload(payload: OutboxEvent["payload"]): string {
  return canonicalJson(payload);
}
