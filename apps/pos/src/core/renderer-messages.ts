import {
  type CredentialsCoreToRendererMessage,
  credentialsRendererToCoreMessageSchema,
  type RegisterCoreToRendererMessage,
  registerRendererToCoreMessageSchema,
  type SalesCoreToRendererMessage,
  type SessionsCoreToRendererMessage,
  type SyncCoreToRendererMessage,
  salesRendererToCoreMessageSchema,
  sessionsRendererToCoreMessageSchema,
} from "@purosur/contracts";
import { z } from "zod";

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  sessionsRendererToCoreMessageSchema,
  credentialsRendererToCoreMessageSchema,
  registerRendererToCoreMessageSchema,
  salesRendererToCoreMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export type CoreToRendererMessage =
  | SessionsCoreToRendererMessage
  | CredentialsCoreToRendererMessage
  | RegisterCoreToRendererMessage
  | SalesCoreToRendererMessage
  | SyncCoreToRendererMessage;
