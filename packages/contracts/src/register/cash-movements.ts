import {
  ARGENTINA_TIME_ZONE,
  CASH_MOVEMENT_KINDS,
  cashMovementReason,
  isValidCashMovementAmount,
} from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";

const kindTotal = z.object({ movements: z.int().nonnegative(), amount: z.int().nonnegative() });

export const cashMovementsSchema = z.object({
  range: answeredRangeSchema,
  totals: z.object({ cash_in: kindTotal, cash_out: kindTotal, withdrawal: kindTotal }),
  movements: z.array(
    z.object({
      id: recordIdSchema(),
      occurred_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      kind: z.enum(CASH_MOVEMENT_KINDS),
      reason: z.string().refine((reason) => cashMovementReason(reason) === reason),
      amount: z.int().refine(isValidCashMovementAmount),
      session_id: recordIdSchema(),
      register_name: z.string(),
      session_opened_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
    }),
  ),
});

export type CashMovementsBody = z.output<typeof cashMovementsSchema>;
