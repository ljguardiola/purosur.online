import type { JsonValue } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "./record-id.js";

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

export const pushedEventSchema = z.object({
  event_id: recordIdSchema(),
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
