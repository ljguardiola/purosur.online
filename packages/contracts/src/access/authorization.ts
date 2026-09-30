import { z } from "zod";

export const authorizationSchema = z.object({ user_id: z.string(), pin: z.string() });
export type Authorization = z.infer<typeof authorizationSchema>;

export const authorizedBySchema = z.object({ user_id: z.string(), first_name: z.string() });
export type AuthorizedBy = z.infer<typeof authorizedBySchema>;

export const authorizationRefusalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wrong_pin") }),
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type AuthorizationRefusal = z.infer<typeof authorizationRefusalSchema>;
