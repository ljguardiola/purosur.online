import { isWellFormedPinCode } from "@purosur/domain";
import { z } from "zod";

export const userPinCodeSchema = z.object({
  code: z.string().refine(isWellFormedPinCode),
  expires_at: z.iso.datetime(),
});

export type UserPinCodeWire = z.output<typeof userPinCodeSchema>;
