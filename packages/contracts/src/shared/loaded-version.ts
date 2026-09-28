import { z } from "zod";

const MESSAGE = "version must be the positive integer it was loaded with";

export const loadedVersionSchema = z.number({ error: MESSAGE }).int(MESSAGE).min(1, MESSAGE);
