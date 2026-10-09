import { PUSH_BATCH_MAX_EVENTS, SALES_DENIED_REASONS } from "@purosur/domain";
import { z } from "zod";
import { pushedEventSchema } from "../shared/index.js";

const storageTelemetrySchema = z.object({
  wal_size_bytes: z.int().nonnegative(),
  disk_free_bytes: z.int().nonnegative(),
  disk_free_ratio: z.number().min(0).max(1),
});

const absent = z.undefined().optional();

const registerTelemetrySchema = z.union([
  storageTelemetrySchema.extend({
    sales_denied: z.literal(true),
    sales_denied_reason: z.enum(SALES_DENIED_REASONS),
  }),
  storageTelemetrySchema.extend({ sales_denied: z.literal(false), sales_denied_reason: absent }),
  storageTelemetrySchema.extend({ sales_denied: absent, sales_denied_reason: absent }),
]);

export const PUSH_EVENTS_REQUEST_MAX_BYTES = 16_777_216;

export const pushEventsRequestSchema = z.object({
  app_version: z.string().min(1),
  telemetry: registerTelemetrySchema,
  events: z.array(pushedEventSchema).max(PUSH_BATCH_MAX_EVENTS),
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
  z.object({ status: z.literal("update_required"), ack_seq: ackSeqSchema }),
]);

export type PushEventsResponse = z.output<typeof pushEventsResponseSchema>;
