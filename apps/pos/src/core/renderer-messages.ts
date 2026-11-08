import {
  type BackupsCoreToRendererMessage,
  backupsRendererToCoreMessageSchema,
  type CredentialsCoreToRendererMessage,
  credentialsRendererToCoreMessageSchema,
  type FiscalCoreToRendererMessage,
  fiscalRendererToCoreMessageSchema,
  type InstallationCoreToRendererMessage,
  installationRendererToCoreMessageSchema,
  type PaymentsCoreToRendererMessage,
  paymentsRendererToCoreMessageSchema,
  type RegisterCoreToRendererMessage,
  type ReturnsCoreToRendererMessage,
  registerRendererToCoreMessageSchema,
  returnsRendererToCoreMessageSchema,
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
  installationRendererToCoreMessageSchema,
  salesRendererToCoreMessageSchema,
  returnsRendererToCoreMessageSchema,
  paymentsRendererToCoreMessageSchema,
  stockRendererToCoreMessageSchema,
  fiscalRendererToCoreMessageSchema,
  backupsRendererToCoreMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export type CoreToRendererMessage =
  | SessionsCoreToRendererMessage
  | CredentialsCoreToRendererMessage
  | RegisterCoreToRendererMessage
  | InstallationCoreToRendererMessage
  | SalesCoreToRendererMessage
  | ReturnsCoreToRendererMessage
  | StockCoreToRendererMessage
  | FiscalCoreToRendererMessage
  | BackupsCoreToRendererMessage
  | PaymentsCoreToRendererMessage
  | SyncCoreToRendererMessage;
