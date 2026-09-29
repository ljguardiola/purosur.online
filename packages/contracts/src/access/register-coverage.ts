import { isPermissionKey, type PermissionKey } from "@purosur/domain";
import { z } from "zod";

export const registerCoverageSchema = z.object({
  uncovered_permissions: z.array(z.custom<PermissionKey>(isPermissionKey)),
});

export type RegisterCoverageWire = z.output<typeof registerCoverageSchema>;
