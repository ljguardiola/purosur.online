import { DISCOUNT_TARGET_KINDS } from "@purosur/domain";
import { z } from "zod";

const TARGET_MESSAGE = "target must be an object with a kind and an id";

const discountTargetKindSchema = z.enum(DISCOUNT_TARGET_KINDS, {
  error: "target.kind must be PRODUCT, CATEGORY or TAG",
});

export const discountTargetSchema = z.object(
  {
    kind: discountTargetKindSchema,
    id: z.guid({ error: "target.id must be an existing target's id" }),
  },
  { error: TARGET_MESSAGE },
);
