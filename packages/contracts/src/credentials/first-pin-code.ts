import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const firstPinCodeBodySchema = z.object({
  user_id: recordIdSchema(),
});

export type FirstPinCodeBody = z.input<typeof firstPinCodeBodySchema>;

export const firstPinCodeSchema = z.object({
  expires_at: z.iso.datetime(),
});

export type FirstPinCodeWire = z.output<typeof firstPinCodeSchema>;
