import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const calendarDay = z.string().refine(isCalendarDay);

export const answeredRangeSchema = z.object({ from: calendarDay, to: calendarDay });
