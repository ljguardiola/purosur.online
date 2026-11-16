import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const calendarDay = z.string().refine(isCalendarDay);

export const calendarRangeSchema = z.object({ from: calendarDay, to: calendarDay });

export const answeredRangeSchema = calendarRangeSchema.extend({ today: calendarDay });
