import { z } from "zod";

export const deviceTokenRotationSchema = z.object({
  device_token: z.string(),
});

export type DeviceTokenRotation = z.output<typeof deviceTokenRotationSchema>;
