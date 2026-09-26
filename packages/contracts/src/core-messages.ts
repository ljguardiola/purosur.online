import { z } from "zod";

export const rendererPingMessageSchema = z.object({
  type: z.literal("ping"),
});
export type RendererPingMessage = z.infer<typeof rendererPingMessageSchema>;

export const rendererToCoreMessageSchema = rendererPingMessageSchema;
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export const mainHealthCheckMessageSchema = z.object({
  type: z.literal("health-check"),
});
export type MainHealthCheckMessage = z.infer<typeof mainHealthCheckMessageSchema>;

export const mainToCoreMessageSchema = mainHealthCheckMessageSchema;
export type MainToCoreMessage = z.infer<typeof mainToCoreMessageSchema>;

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;
