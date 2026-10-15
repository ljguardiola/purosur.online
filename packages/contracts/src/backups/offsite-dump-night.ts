import { isOffsiteDumpNight } from "@purosur/domain";
import { z } from "zod";

export const offsiteDumpNightSchema = z.string().refine(isOffsiteDumpNight, {
  message: "night must be a calendar day written YYYY-MM-DD",
});
