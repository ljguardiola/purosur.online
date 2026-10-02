import {
  type AccessCoreToRendererMessage,
  accessRendererToCoreMessageSchema,
  type RegisterCoreToRendererMessage,
  registerRendererToCoreMessageSchema,
  type SalesCoreToRendererMessage,
  type SyncCoreToRendererMessage,
  salesRendererToCoreMessageSchema,
} from "@purosur/contracts";
import { z } from "zod";

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  accessRendererToCoreMessageSchema,
  registerRendererToCoreMessageSchema,
  salesRendererToCoreMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export type CoreToRendererMessage =
  | AccessCoreToRendererMessage
  | RegisterCoreToRendererMessage
  | SalesCoreToRendererMessage
  | SyncCoreToRendererMessage;
