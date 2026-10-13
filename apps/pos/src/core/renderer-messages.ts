import {
  type CredentialsCoreToRendererMessage,
  credentialsRendererToCoreMessageSchema,
  type PaymentsCoreToRendererMessage,
  paymentsRendererToCoreMessageSchema,
  type RegisterCoreToRendererMessage,
  registerRendererToCoreMessageSchema,
  type SalesCoreToRendererMessage,
  type SessionsCoreToRendererMessage,
  type StockCoreToRendererMessage,
  type SyncCoreToRendererMessage,
  salesRendererToCoreMessageSchema,
  sessionsRendererToCoreMessageSchema,
  stockRendererToCoreMessageSchema,
} from "@purosur/contracts";
import { z } from "zod";

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  sessionsRendererToCoreMessageSchema,
  credentialsRendererToCoreMessageSchema,
  registerRendererToCoreMessageSchema,
  salesRendererToCoreMessageSchema,
  paymentsRendererToCoreMessageSchema,
  stockRendererToCoreMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export type CoreToRendererMessage =
  | SessionsCoreToRendererMessage
  | CredentialsCoreToRendererMessage
  | RegisterCoreToRendererMessage
  | SalesCoreToRendererMessage
  | StockCoreToRendererMessage
  | PaymentsCoreToRendererMessage
  | SyncCoreToRendererMessage;
