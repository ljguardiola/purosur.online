import { isQrExternalPosId } from "@purosur/domain";
import { z } from "zod";

const MESSAGE = "external_pos_id must be a QR point of sale id without spaces";

export const qrExternalPosIdSchema = z
  .string({ error: MESSAGE })
  .trim()
  .refine(isQrExternalPosId, MESSAGE);
