import type {
  FindSaleForReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
} from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import { checkLine, EMPTY_RETURN_DRAFT } from "./return-form";
import {
  usePreviewReturnQuery,
  useReturnDraftPreviewQuery,
  useSaleChosenForReturnQuery,
} from "./returns-queries";
import { SALE } from "./test-support/sale-for-return";

const PASTA: ReturnDraftLineBody = {
  sale_line_id: "line-pasta",
  quantity: 3,
  reason: "change_of_mind",
  disposition: "restock",
  resolution: "refund",
};

const PREVIEWED: PreviewReturnOutcome = {
  kind: "previewed",
  lines: [{ ...PASTA, refusal: null, refund_amount: 970_000 }],
  refundable_total: 970_000,
};

type Preview = (
  saleId: string,
  lines: readonly ReturnDraftLineBody[],
) => Promise<PreviewReturnOutcome>;

function PreviewProbe({
  preview,
  lines = [PASTA],
  enabled = true,
}: {
  preview: Preview;
  lines?: readonly ReturnDraftLineBody[];
  enabled?: boolean;
}) {
  const answer = usePreviewReturnQuery({ saleId: "sale-1", lines, preview, enabled });
  if (answer.status === "failed") {
    return (
      <button type="button" onClick={answer.retry}>
        failed
      </button>
    );
  }
  return (
    <p>
      {answer.status === "loaded"
        ? `${answer.refreshing ? "refreshing " : ""}${JSON.stringify(answer.value)}`
        : answer.status}
    </p>
  );
}

describe("return preview query", () => {
  it("holds what the core answers for the sale and the lines it is given", async () => {
    const preview = vi.fn<Preview>(async () => PREVIEWED);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <PreviewProbe preview={preview} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText(JSON.stringify(PREVIEWED))).toBeVisible();
    expect(preview).toHaveBeenCalledExactlyOnceWith("sale-1", [PASTA]);
  });

  it("does not ask while it is not enabled", async () => {
    const preview = vi.fn<Preview>(async () => PREVIEWED);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <PreviewProbe preview={preview} enabled={false} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(preview).not.toHaveBeenCalled();
  });

  it("fails when the core answers it is unavailable, and asks again on retry", async () => {
    const preview = vi
      .fn<Preview>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(PREVIEWED);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <PreviewProbe preview={preview} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "failed" }));

    await expect.element(screen.getByText(JSON.stringify(PREVIEWED))).toBeVisible();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("keeps the last answer, marked as refreshing, while the core answers for other lines", async () => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <PreviewProbe preview={async () => PREVIEWED} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText(JSON.stringify(PREVIEWED))).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <PreviewProbe preview={() => new Promise(() => {})} lines={[{ ...PASTA, quantity: 2 }]} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText(`refreshing ${JSON.stringify(PREVIEWED)}`)).toBeVisible();
  });
});

function DraftPreviewProbe({ preview, marked }: { preview: Preview; marked: boolean }) {
  const [pasta] = SALE.lines;
  const draft =
    marked && pasta !== undefined ? checkLine(EMPTY_RETURN_DRAFT, pasta) : EMPTY_RETURN_DRAFT;
  const answer = useReturnDraftPreviewQuery({ sale: SALE, draft, preview });
  return <p>{answer.status}</p>;
}

describe("return draft preview query", () => {
  it("asks the core about the lines the draft marks, and nothing while none is marked", async () => {
    const preview = vi.fn<Preview>(async () => PREVIEWED);
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <DraftPreviewProbe preview={preview} marked={false} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(preview).not.toHaveBeenCalled();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <DraftPreviewProbe preview={preview} marked />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loaded")).toBeVisible();
    expect(preview).toHaveBeenCalledExactlyOnceWith("sale-1", [PASTA]);
  });
});

type Find = Parameters<typeof useSaleChosenForReturnQuery>[0]["find"];

const FOUND: FindSaleForReturnOutcome = {
  kind: "found",
  sale: SALE,
  ticket_source: "HISTORY",
  ticket_verification_required: false,
};

function ChosenSaleProbe({ find, saleId }: { find: Find; saleId: string | undefined }) {
  const answer = useSaleChosenForReturnQuery({ saleId, find });
  if (answer.status === "failed") {
    return (
      <button type="button" onClick={answer.retry}>
        failed
      </button>
    );
  }
  return <p>{answer.status === "loaded" ? answer.value.kind : answer.status}</p>;
}

describe("sale chosen for a return query", () => {
  it("asks the core for the sale by its id, with no authorization, and holds its answer", async () => {
    const find = vi.fn<Find>(async () => FOUND);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <ChosenSaleProbe find={find} saleId="sale-1" />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("found")).toBeVisible();
    expect(find).toHaveBeenCalledExactlyOnceWith({ kind: "sale", sale_id: "sale-1" }, undefined);
  });

  it("asks nothing while no sale was chosen", async () => {
    const find = vi.fn<Find>(async () => FOUND);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <ChosenSaleProbe find={find} saleId={undefined} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(find).not.toHaveBeenCalled();
  });

  it("fails when the core answers it is unavailable, and asks again on retry", async () => {
    const find = vi
      .fn<Find>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValue(FOUND);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <ChosenSaleProbe find={find} saleId="sale-1" />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "failed" }));

    await expect.element(screen.getByText("found")).toBeVisible();
    expect(find).toHaveBeenCalledTimes(2);
  });
});
