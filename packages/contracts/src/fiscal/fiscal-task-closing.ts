import {
  FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH,
  isFiscalTaskClosingNoteTooLong,
} from "@purosur/domain";
import { z } from "zod";
import { requiredTextSchema } from "../shared/index.js";

export const fiscalTaskClosingBodySchema = z.object({
  note: requiredTextSchema(
    "note",
    FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH,
    isFiscalTaskClosingNoteTooLong,
  ),
});

export type FiscalTaskClosingBody = z.input<typeof fiscalTaskClosingBodySchema>;
