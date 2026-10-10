import { z } from "zod";

const quarantinedEventSchema = z.object({
  eventId: z.string(),
  registerName: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  eventType: z.string(),
  receivedAt: z.iso.datetime(),
  quarantinedAt: z.iso.datetime(),
  lastError: z.string().nullable(),
});

export const quarantinedEventsListSchema = z.object({
  events: z.array(quarantinedEventSchema),
});

export const releaseQuarantinedEventErrorSchema = z.object({
  code: z.enum(["not_found", "not_quarantined"]),
  message: z.string(),
});

export type QuarantinedEventsList = z.output<typeof quarantinedEventsListSchema>;
export type ReleaseQuarantinedEventError = z.output<typeof releaseQuarantinedEventErrorSchema>;
