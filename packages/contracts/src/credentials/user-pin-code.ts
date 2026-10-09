import { isWellFormedPinCode, PIN_CODE_VALIDITY_MS } from "@purosur/domain";
import { z } from "zod";

export const userPinCodeSchema = z.object({
  code: z.string().refine(isWellFormedPinCode),
  expires_at: z.iso.datetime().meta({ validityMs: PIN_CODE_VALIDITY_MS }),
});

export type UserPinCodeWire = z.output<typeof userPinCodeSchema>;
