import { z } from "zod";

// Minimal, business-free message set: enough to prove the validation gate
// exists on both channels that reach the core process.
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
