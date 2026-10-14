import { isPointTerminalId } from "@purosur/domain";
import { z } from "zod";

const MESSAGE = "terminal_id must be a Point terminal id without spaces";

export const pointTerminalIdSchema = z
  .string({ error: MESSAGE })
  .trim()
  .refine(isPointTerminalId, MESSAGE);
