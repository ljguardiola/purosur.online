import { z } from "zod";

export const refreshSchema = z.boolean({ error: "refresh must be true or false" });
