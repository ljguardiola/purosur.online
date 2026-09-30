import { z } from "zod";

export const userPinCodeSchema = z.object({
  code: z.string().regex(/^[A-Z2-7]{16}$/),
  expires_at: z.iso.datetime(),
});

export type UserPinCodeWire = z.output<typeof userPinCodeSchema>;
