import { REPORT_GROUPS } from "@purosur/domain";
import { z } from "zod";

export const reportGroupSchema = z.enum(REPORT_GROUPS);

export type ReportGroupBody = z.output<typeof reportGroupSchema>;
