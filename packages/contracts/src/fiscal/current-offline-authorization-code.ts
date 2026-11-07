import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const calendarDay = z.string().refine(isCalendarDay);

export const currentOfflineAuthorizationCodeSchema = z.object({
  offline_authorization_code: z
    .object({
      code: z.string(),
      fortnight_start: calendarDay,
      fortnight_end: calendarDay,
      report_deadline: calendarDay,
    })
    .nullable(),
});

export type CurrentOfflineAuthorizationCode = z.output<
  typeof currentOfflineAuthorizationCodeSchema
>;
