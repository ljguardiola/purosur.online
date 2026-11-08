import { z } from "zod";
import { installationKeysSchema } from "../shared/index.js";

export const deviceTokenRotationSchema = z.object({
  device_token: z.string(),
  ...installationKeysSchema.shape,
});

export type DeviceTokenRotation = z.output<typeof deviceTokenRotationSchema>;
