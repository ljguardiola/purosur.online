import { SALES_REPORT_GROUPS } from "@purosur/domain";
import { z } from "zod";

export const salesReportGroupSchema = z.enum(SALES_REPORT_GROUPS);

export type SalesReportGroupBody = z.output<typeof salesReportGroupSchema>;
