import { z } from "zod";

export const reportMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
