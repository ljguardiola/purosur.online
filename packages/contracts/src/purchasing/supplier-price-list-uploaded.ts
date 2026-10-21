import { z } from "zod";

export const supplierPriceListUploadedSchema = z.object({ listId: z.string() });
