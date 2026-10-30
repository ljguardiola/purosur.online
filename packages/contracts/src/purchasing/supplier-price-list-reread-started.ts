import { z } from "zod";

export const supplierPriceListRereadStartedSchema = z.object({ listId: z.string() });
