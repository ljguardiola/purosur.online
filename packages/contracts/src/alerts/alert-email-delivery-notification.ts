import { z } from "zod";

const EMAIL_EVENT_PREFIX = "email.";

const emailEventSchema = z.object({
  type: z.string().startsWith(EMAIL_EVENT_PREFIX),
  data: z.object({ email_id: z.string().min(1) }),
});

const otherEventSchema = z.object({
  type: z.string().refine((type) => !type.startsWith(EMAIL_EVENT_PREFIX)),
});

export const alertEmailDeliveryNotificationSchema = z.union([emailEventSchema, otherEventSchema]);
