import { z } from "zod";

export const registerEnrollmentCodeSchema = z.object({
  code: z.string(),
  expires_at: z.string(),
});

export type RegisterEnrollmentCodeBody = z.output<typeof registerEnrollmentCodeSchema>;
