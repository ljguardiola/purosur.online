import {
  PRE_EMISSION_GATE_FAILURE_REASONS,
  PUSH_BATCH_MAX_EVENTS,
  SALES_DENIED_REASONS,
  SERIAL_DEVICE_REPORT_STANDINGS,
} from "@purosur/domain";
import { z } from "zod";
import { pushedEventSchema, serialDeviceIdentitySchema } from "../shared/index.js";

const absent = z.undefined().optional();

const serialDeviceReportSchema = z.union([
  z.strictObject({
    standing: z.enum(SERIAL_DEVICE_REPORT_STANDINGS),
    ...serialDeviceIdentitySchema.shape,
  }),
  z.strictObject({
    standing: z.enum(SERIAL_DEVICE_REPORT_STANDINGS),
    vendor_id: absent,
    product_id: absent,
  }),
]);

export const MALFORMED_BATTERY_REPORT = "malformed" as const;

const batteryReportSchema = z
  .union([
    z.strictObject({ present: z.literal(false) }),
    z.strictObject({
      present: z.literal(true),
      charge_percent: z.int().min(0).max(100),
      health_percent: z.int32().nonnegative().optional(),
      on_battery: z.boolean(),
      on_battery_minutes: z.int32().nonnegative(),
    }),
  ])
  .or(z.unknown().transform(() => MALFORMED_BATTERY_REPORT));

const storageTelemetrySchema = z.object({
  wal_size_bytes: z.int().nonnegative(),
  disk_free_bytes: z.int().nonnegative(),
  disk_free_ratio: z.number().min(0).max(1),
  serial_devices: z
    .strictObject({ scale: serialDeviceReportSchema, reader: serialDeviceReportSchema })
    .optional(),
  battery: batteryReportSchema.optional(),
});

const salesDeniedReportSchema = z.union([
  z.object({
    sales_denied: z.literal(true),
    sales_denied_reason: z.enum(SALES_DENIED_REASONS),
  }),
  z.object({ sales_denied: z.literal(false), sales_denied_reason: absent }),
  z.object({ sales_denied: absent, sales_denied_reason: absent }),
]);

const fiscalEmissionStoppedReportSchema = z.union([
  z.object({
    fiscal_emission_stopped: z.literal(true),
    fiscal_emission_stopped_reason: z.enum(PRE_EMISSION_GATE_FAILURE_REASONS),
  }),
  z.object({
    fiscal_emission_stopped: z.literal(false),
    fiscal_emission_stopped_reason: absent,
  }),
  z.object({ fiscal_emission_stopped: absent, fiscal_emission_stopped_reason: absent }),
]);

const registerTelemetrySchema = storageTelemetrySchema
  .and(salesDeniedReportSchema)
  .and(fiscalEmissionStoppedReportSchema);

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
