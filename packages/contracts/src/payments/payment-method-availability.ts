import { POINT_TERMINAL_AVAILABILITIES, QR_AVAILABILITIES } from "@purosur/domain";
import { z } from "zod";

export const paymentMethodAvailabilitySchema = z.object({
  qr: z.enum(QR_AVAILABILITIES),
  point: z.enum(POINT_TERMINAL_AVAILABILITIES),
  point_minimum: z.int().positive(),
});
export type PaymentMethodAvailability = z.output<typeof paymentMethodAvailabilitySchema>;
