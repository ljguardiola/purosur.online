import { type JsonValue, PUSH_BATCH_MAX_EVENTS } from "@purosur/domain";
import { z } from "zod";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.int(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const pushedEventSchema = z.object({
  event_id: z.uuid(),
  device_seq: z.int().positive(),
  aggregate_type: z.string().min(1),
  aggregate_id: z.string().min(1),
  event_type: z.string().min(1),
  schema_version: z.int().positive(),
  payload: z.record(z.string(), jsonValueSchema),
  occurred_at: z.iso.datetime(),
  actor_id: z.string().min(1),
  chain_hmac: z.string().min(1),
});

const registerTelemetrySchema = z.object({
  wal_size_bytes: z.int().nonnegative(),
  disk_free_bytes: z.int().nonnegative(),
  disk_free_ratio: z.number().min(0).max(1),
});

export const pushEventsRequestSchema = z.object({
  app_version: z.string().min(1),
  telemetry: registerTelemetrySchema,
  events: z.array(pushedEventSchema).min(1).max(PUSH_BATCH_MAX_EVENTS),
});

export type PushEventsRequest = z.output<typeof pushEventsRequestSchema>;

const ackSeqSchema = z.int().nonnegative();

export const pushEventsResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), ack_seq: ackSeqSchema }),
  z.object({
    status: z.literal("expected_seq"),
    ack_seq: ackSeqSchema,
    expected_seq: z.int().positive(),
  }),
  z.object({ status: z.literal("stale_device"), ack_seq: ackSeqSchema }),
]);

export type PushEventsResponse = z.output<typeof pushEventsResponseSchema>;
