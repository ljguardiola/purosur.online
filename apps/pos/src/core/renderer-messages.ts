import {
  type AccessCoreToRendererMessage,
  accessRendererToCoreMessageSchema,
  type CredentialsCoreToRendererMessage,
  credentialsRendererToCoreMessageSchema,
  type RegisterCoreToRendererMessage,
  registerRendererToCoreMessageSchema,
  type SalesCoreToRendererMessage,
  type SyncCoreToRendererMessage,
  salesRendererToCoreMessageSchema,
} from "@purosur/contracts";
import { z } from "zod";

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  accessRendererToCoreMessageSchema,
  credentialsRendererToCoreMessageSchema,
  registerRendererToCoreMessageSchema,
  salesRendererToCoreMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export type CoreToRendererMessage =
  | AccessCoreToRendererMessage
  | CredentialsCoreToRendererMessage
  | RegisterCoreToRendererMessage
  | SalesCoreToRendererMessage
  | SyncCoreToRendererMessage;
