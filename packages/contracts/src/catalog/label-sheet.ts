import {
  isValidLabelCount,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  type LabelRequestEntry,
  labelRequestProblem,
} from "@purosur/domain";
import { z } from "zod";

const LIST_MESSAGE = "labels must be a non-empty list of { productId, count }";
const ENTRY_MESSAGE = `each label must have an existing product's id and a count between 1 and ${LABELS_MAX_COUNT_PER_PRODUCT}`;
const REPEATED_MESSAGE = "the same productId was sent more than once";
const TOTAL_MESSAGE = `the total label count must be at most ${LABELS_MAX_TOTAL_COUNT}`;

const productIdSchema = z.guid();

function readEntry(entry: unknown): LabelRequestEntry | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const { productId, count } = entry as { productId?: unknown; count?: unknown };
  if (typeof productId !== "string" || !productIdSchema.safeParse(productId).success) {
    return undefined;
  }
  if (typeof count !== "number" || !isValidLabelCount(count)) {
    return undefined;
  }
  return { productId: productId.toLowerCase(), count };
}

function readEntriesUntilInvalid(entries: unknown[]): LabelRequestEntry[] {
  const readEntries: LabelRequestEntry[] = [];
  for (const rawEntry of entries) {
    const entry = readEntry(rawEntry);
    if (!entry) {
      break;
    }
    readEntries.push(entry);
  }
  return readEntries;
}

export const labelSheetBodySchema = z.object({
  labels: z
    .array(z.custom<LabelRequestEntry>(), { error: LIST_MESSAGE })
    .min(1, LIST_MESSAGE)
    .transform((entries, context) => {
      const readEntries = readEntriesUntilInvalid(entries);
      const problem = labelRequestProblem(readEntries);
      const message =
        problem === "repeated_product"
          ? REPEATED_MESSAGE
          : readEntries.length < entries.length
            ? ENTRY_MESSAGE
            : problem === "too_many_labels"
              ? TOTAL_MESSAGE
              : undefined;
      if (message) {
        context.issues.push({ code: "custom", message, input: entries });
        return z.NEVER;
      }
      return readEntries;
    })
    .meta({
      maxCountPerProduct: LABELS_MAX_COUNT_PER_PRODUCT,
      maxTotalCount: LABELS_MAX_TOTAL_COUNT,
    }),
});

export type LabelSheetBody = z.input<typeof labelSheetBodySchema>;
