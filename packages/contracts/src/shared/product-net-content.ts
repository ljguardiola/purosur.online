import {
  isNetContentUnit,
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  type NetContentUnit,
} from "@purosur/domain";
import { z } from "zod";

const NET_CONTENT_MESSAGE =
  "netContent must be an object with a quantity and a listed unit, or absent/null";

const NET_CONTENT_QUANTITY_MESSAGE = `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`;

export const netContentQuantitySchema = z
  .number()
  .refine(isValidNetContentQuantity, NET_CONTENT_QUANTITY_MESSAGE)
  .meta({
    maxValue: NET_CONTENT_QUANTITY_MAX,
    maxDecimals: NET_CONTENT_QUANTITY_MAX_DECIMALS,
  });

export const productNetContentSchema = z
  .object(
    {
      // z.number refuses Infinity, which JSON.parse yields for an out-of-range literal such as
      // 1e400; accepting any number lets the quantity rule report it under netContentQuantity.
      quantity: z.custom<number>((quantity) => typeof quantity === "number", {
        error: NET_CONTENT_MESSAGE,
      }),
      unit: z.custom<NetContentUnit>(isNetContentUnit, { error: NET_CONTENT_MESSAGE }),
    },
    { error: NET_CONTENT_MESSAGE },
  )
  .nullish()
  .transform((netContent) => netContent ?? null);

export function checkNetContentQuantity(
  product: { netContent: { quantity: number } | null },
  context: z.core.$RefinementCtx,
) {
  if (
    product.netContent &&
    !netContentQuantitySchema.safeParse(product.netContent.quantity).success
  ) {
    context.addIssue({
      code: "custom",
      path: ["netContentQuantity"],
      message: NET_CONTENT_QUANTITY_MESSAGE,
    });
  }
}

export const NET_CONTENT_QUANTITY_CHECK_OPTIONS: {
  when: (payload: z.core.ParsePayload) => boolean;
} = {
  // zod records a body that is not an object with no path, and keeps checking it.
  when: ({ issues }) =>
    issues.every((issue) => issue.path !== undefined && issue.path[0] !== "netContent"),
};
