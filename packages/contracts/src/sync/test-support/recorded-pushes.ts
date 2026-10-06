import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { type PushEventsRequest, pushEventsRequestSchema } from "../events.js";

export const RECORDED_PUSHES_DIR = new URL("./recorded-pushes/", import.meta.url);

const sentPushSchema = z.object({
  events: z.array(
    z.object({ event_type: z.string(), schema_version: z.number() }).catchall(z.json()),
  ),
});

type SentEvent = z.infer<typeof sentPushSchema>["events"][number];

const recordedPushSchema = z.object({
  outbox_chain_key: z.string().min(1),
  push: z.record(z.string(), z.unknown()),
});

export interface RecordedPush {
  name: string;
  outboxChainKey: string;
  sentBody: Record<string, unknown>;
  push: PushEventsRequest;
}

export function sentEvents(body: unknown): SentEvent[] {
  return sentPushSchema.parse(JSON.parse(JSON.stringify(body))).events;
}

export function recordedPushes(): RecordedPush[] {
  return readdirSync(RECORDED_PUSHES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const recorded = recordedPushSchema.parse(
        JSON.parse(readFileSync(new URL(name, RECORDED_PUSHES_DIR), "utf8")),
      );
      return {
        name,
        outboxChainKey: recorded.outbox_chain_key,
        sentBody: recorded.push,
        push: pushEventsRequestSchema.parse(recorded.push),
      };
    });
}

export function recordedEvents(): SentEvent[] {
  return recordedPushes().flatMap((recorded) => sentEvents(recorded.sentBody));
}
