import type { PreviewReturnOutcome, ReturnDraftLineBody } from "@purosur/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions } from "../platform/use-core-query";
import type { ReturnDraft } from "./return-form";
import { draftLinesFor } from "./return-form";
import type { SaleForReturn } from "./return-sale";

const returnsKey = ["returns"] as const;

const returnsKeys = {
  preview: (saleId: string, lines: readonly ReturnDraftLineBody[]) =>
    [...returnsKey, "preview", saleId, lines] as const,
};

export type ShownReturnPreview = Exclude<PreviewReturnOutcome, { kind: "unavailable" }>;

export function usePreviewReturnQuery({
  saleId,
  lines,
  preview,
  enabled,
}: {
  saleId: string;
  lines: readonly ReturnDraftLineBody[];
  preview: (saleId: string, lines: readonly ReturnDraftLineBody[]) => Promise<PreviewReturnOutcome>;
  enabled: boolean;
}): CoreData<ShownReturnPreview> {
  const query = useQuery({
    ...coreQueryOptions<ShownReturnPreview>({
      queryKey: returnsKeys.preview(saleId, lines),
      read: async () => {
        const outcome = await preview(saleId, lines);
        return outcome.kind === "unavailable" ? "unavailable" : outcome;
      },
    }),
    enabled,
    placeholderData: keepPreviousData,
  });
  if (query.isError && !query.isFetching) {
    return { status: "failed", retry: () => void query.refetch() };
  }
  if (query.data !== undefined) {
    return {
      status: "loaded",
      value: query.data,
      refreshing: query.isFetching || query.isPlaceholderData,
    };
  }
  return { status: "loading" };
}

export function useReturnDraftPreviewQuery({
  sale,
  draft,
  preview,
}: {
  sale: SaleForReturn;
  draft: ReturnDraft;
  preview: (saleId: string, lines: readonly ReturnDraftLineBody[]) => Promise<PreviewReturnOutcome>;
}): CoreData<ShownReturnPreview> {
  const lines = draftLinesFor(sale, draft);
  return usePreviewReturnQuery({
    saleId: sale.sale_id,
    lines,
    preview,
    enabled: lines.length > 0,
  });
}
