import { z } from "zod";

export const firstPinCodeBodySchema = z.object({
  user_id: z.uuid(),
});

export type FirstPinCodeBody = z.input<typeof firstPinCodeBodySchema>;

export const firstPinCodeSchema = z.object({
  expires_at: z.iso.datetime(),
});

export type FirstPinCodeWire = z.output<typeof firstPinCodeSchema>;
