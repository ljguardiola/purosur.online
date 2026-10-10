import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

const instantSchema = z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE });

const quarantinedEventSchema = z.object({
  eventId: z.string(),
  registerName: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  eventType: z.string(),
  receivedAt: instantSchema,
  quarantinedAt: instantSchema,
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
