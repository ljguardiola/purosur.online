import { DISCOUNT_TARGET_KINDS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "./record-id.js";

const TARGET_MESSAGE = "target must be an object with a kind and an id";

const discountTargetKindSchema = z.enum(DISCOUNT_TARGET_KINDS, {
  error: "target.kind must be PRODUCT, CATEGORY or TAG",
});

export const discountTargetSchema = z.object(
  {
    kind: discountTargetKindSchema,
    id: recordIdSchema("target.id must be an existing target's id"),
  },
  { error: TARGET_MESSAGE },
);
