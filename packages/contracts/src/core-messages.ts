import { z } from "zod";

// Minimal, business-free messages for the two channels that reach the core process (enough to
// prove the core's validation gate exists on both), plus main's core status for the renderer.
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

// Main tells the renderer whether the core is reachable, so a compromised or buggy sender can
// never push the renderer into (or out of) its blocking notice with an arbitrary payload.
export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;
