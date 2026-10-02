import { z } from "zod";
import { pinAttemptRefusalSchema } from "./pin-attempt-refusal.js";

export const authorizationSchema = z.object({ user_id: z.string(), pin: z.string() });
export type Authorization = z.infer<typeof authorizationSchema>;

export const authorizedBySchema = z.object({ user_id: z.string(), first_name: z.string() });
export type AuthorizedBy = z.infer<typeof authorizedBySchema>;

export const authorizationRefusalSchema = z.discriminatedUnion("kind", [
  ...pinAttemptRefusalSchema.options,
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type AuthorizationRefusal = z.infer<typeof authorizationRefusalSchema>;
