import { LABELS_MAX_COUNT_PER_PRODUCT, LABELS_MAX_TOTAL_COUNT } from "@purosur/domain";
import { z } from "zod";

const LIST_MESSAGE = "labels must be a non-empty list of { productId, count }";
const ENTRY_MESSAGE = `each label must have an existing product's id and a count between 1 and ${LABELS_MAX_COUNT_PER_PRODUCT}`;
const REPEATED_MESSAGE = "the same productId was sent more than once";
const TOTAL_MESSAGE = `the total label count must be at most ${LABELS_MAX_TOTAL_COUNT}`;

const productIdSchema = z.guid();

interface LabelEntry {
  productId: string;
  count: number;
}

function readEntry(entry: unknown): LabelEntry | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const { productId, count } = entry as { productId?: unknown; count?: unknown };
  if (typeof productId !== "string" || !productIdSchema.safeParse(productId).success) {
    return undefined;
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > LABELS_MAX_COUNT_PER_PRODUCT
  ) {
    return undefined;
  }
  return { productId: productId.toLowerCase(), count };
}

export const labelSheetBodySchema = z.object({
  labels: z
    .array(z.custom<LabelEntry>(), { error: LIST_MESSAGE })
    .min(1, LIST_MESSAGE)
    .transform((entries, context) => {
      const readEntries = new Map<string, LabelEntry>();
      let total = 0;
      for (const rawEntry of entries) {
        const entry = readEntry(rawEntry);
        if (!entry) {
          context.issues.push({ code: "custom", message: ENTRY_MESSAGE, input: entries });
          return z.NEVER;
        }
        if (readEntries.has(entry.productId)) {
          context.issues.push({ code: "custom", message: REPEATED_MESSAGE, input: entries });
          return z.NEVER;
        }
        readEntries.set(entry.productId, entry);
        total += entry.count;
      }
      if (total > LABELS_MAX_TOTAL_COUNT) {
        context.issues.push({ code: "custom", message: TOTAL_MESSAGE, input: entries });
        return z.NEVER;
      }
      return [...readEntries.values()];
    }),
});

export type LabelSheetBody = z.input<typeof labelSheetBodySchema>;
