import { isNetContentUnit, type NetContentUnit } from "@purosur/domain";
import { z } from "zod";

export const netContentSchema = z.object({
  quantity: z.number(),
  unit: z.custom<NetContentUnit>(isNetContentUnit),
});
