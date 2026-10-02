import { z } from "zod";

export function recordIdSchema(message = "must be a record id") {
  return z.guid({ error: message }).toLowerCase();
}
