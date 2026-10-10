import type {
  CashChargeAnswer,
  CurrentSaleAnswer,
  FollowMercadoPagoQrChargeOutcome,
  OpenSale,
  ReceiptPrintStatusOutcome,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SalesHistoryQuery } from "../platform/core-client";
import { createQueryClient } from "../platform/query-client";
import {
  useCashChargeQuery,
  useCurrentSaleQuery,
  useQrChargeQuery,
  useReadCurrentSale,
  useReceiptPrintStatusQuery,
  useRefreshCurrentSale,
  useRefreshReceiptPrintStatus,
  useRefreshSalesHistory,
  useResetCurrentSale,
  useSaleHistoryDetailQuery,
  useSalesHistoryQuery,
  useSearchProducts,
  useTakeSale,
} from "./sales-queries";

const SALE: OpenSale = {
  id: "sale-1",
  lines: [
    {
      id: "line-1",
      product_id: "p1",
      product_name: "Yerba mate 1 kg",
      sale_unit: "UNIT" as const,
      weight_source: null,
      quantity: 1,
      list_unit_price: 238_000,
      discount_amount: 0,
      promotion: null,
      line_total: 238_000,
    },
  ],
  total: 238_000,
  paid: 0,
  pending: 238_000,
  lines_lock: null,
  cancel_refusal: null,
  charge_refusal: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
};

function CurrentSaleProbe({
  read,
  sessionId = "s1",
  userId = "u1",
}: {
  read: () => Promise<CurrentSaleAnswer>;
  sessionId?: string;
  userId?: string;
}) {
  const current = useCurrentSaleQuery({ sessionId, userId, read });
  const takeSale = useTakeSale(sessionId, userId);
  const refreshCurrentSale = useRefreshCurrentSale(sessionId, userId);
  const resetCurrentSale = useResetCurrentSale(sessionId, userId);
  const readCurrentSale = useReadCurrentSale(sessionId, userId, read);
  let text: string = current.status;
  if (current.status === "loaded") {
    text =
      current.value === null || current.value === "not_permitted"
        ? String(current.value)
        : current.value.id;
  }
  return (
    <>
      <p>{text}</p>
      <button type="button" onClick={() => takeSale(SALE)}>
        take
      </button>
      <button type="button" onClick={() => takeSale(null)}>
        take none
      </button>
      <button type="button" onClick={() => void refreshCurrentSale()}>
        refresh
      </button>
      <button type="button" onClick={() => void resetCurrentSale()}>
        reset
      </button>
      <button
        type="button"
        onClick={() =>
          void readCurrentSale().then((answer) => {
            document.title =
              answer === null || answer === "not_permitted" || answer === "unavailable"
                ? String(answer)
                : `read ${answer.id}`;
          })
        }
      >
        read
      </button>
      {current.status === "loaded" &&
      current.value !== null &&
      current.value !== "not_permitted" ? (
        <p>lines {current.value.lines_lock ?? "editable"}</p>
      ) : null}
    </>
  );
}

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

describe("current sale query", () => {
  it.each<[string, CurrentSaleAnswer]>([
    ["the sale in progress", SALE],
    ["no sale yet", null],
    ["a refusal to sell", "not_permitted"],
  ])("holds %s as an answer, not a failure", async (_name, answer) => {
    const screen = await renderWithClient(<CurrentSaleProbe read={async () => answer} />);

    await expect
      .element(
        screen.getByText(
          answer === null || answer === "not_permitted" ? String(answer) : answer.id,
        ),
      )
      .toBeVisible();
  });

  it.each([
    ["another person", "s1", "u2"],
    ["another session", "s2", "u1"],
  ])("never shows the answer given to %s", async (_who, sessionId, userId) => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <CurrentSaleProbe read={async () => "not_permitted"} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("not_permitted")).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <CurrentSaleProbe
          read={() => new Promise(() => {})}
          sessionId={sessionId}
          userId={userId}
        />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <CurrentSaleProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("shows a sale the register took from an outcome without reading again", async () => {
    const read = vi.fn<() => Promise<CurrentSaleAnswer>>(async () => null);
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("null")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "take" }));

    await expect.element(screen.getByText("sale-1")).toBeVisible();
    expect(read).toHaveBeenCalledOnce();
  });

  it("shows no sale when the register took none from an outcome", async () => {
    const read = vi.fn<() => Promise<CurrentSaleAnswer>>(async () => SALE);
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "take none" }));

    await expect.element(screen.getByText("null")).toBeVisible();
    expect(read).toHaveBeenCalledOnce();
  });

  it("goes back to loading until the sale is read again when it is reset", async () => {
    let answer: (sale: CurrentSaleAnswer) => void = () => {};
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "reset" }));
    await expect.element(screen.getByText("loading")).toBeVisible();
    answer(null);

    await expect.element(screen.getByText("null")).toBeVisible();
  });

  it("keeps the sale shown while it is read again and then shows the new answer", async () => {
    let answer: (sale: CurrentSaleAnswer) => void = () => {};
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.poll(() => read).toHaveBeenCalledTimes(2);
    await expect.element(screen.getByText("sale-1")).toBeVisible();
    answer(null);

    await expect.element(screen.getByText("null")).toBeVisible();
  });

  it.each<[string, Pick<OpenSale, "lines_lock" | "cancel_refusal">]>([
    [
      "its lines are locked",
      { lines_lock: "qr_charge_in_progress", cancel_refusal: "qr_charge_in_progress" },
    ],
    [
      "cancelling it is refused",
      { lines_lock: "approved_payment", cancel_refusal: "qr_charge_in_progress" },
    ],
  ])(
    "reads the sale again every second while %s by a QR charge in its wait, and stops once the core lifts it",
    async (_name, wait) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const answers: CurrentSaleAnswer[] = [{ ...SALE, ...wait }, SALE];
      const read = vi.fn(async () => (answers.length > 1 ? answers.shift() : answers[0]) ?? null);
      const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
      await expect.element(screen.getByText(`lines ${wait.lines_lock}`)).toBeVisible();

      await vi.advanceTimersByTimeAsync(1000);

      await expect.element(screen.getByText("lines editable")).toBeVisible();
      await vi.advanceTimersByTimeAsync(5000);
      expect(read).toHaveBeenCalledTimes(2);
    },
  );

  it("reads the sale only once while no QR charge of it waits", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const read = vi.fn(async (): Promise<CurrentSaleAnswer> => SALE);
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("lines editable")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5000);

    expect(read).toHaveBeenCalledOnce();
  });

  it("asks the core for the sale when it is read, answering and showing what the core says now", async () => {
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce({ ...SALE, lines_lock: "qr_charge_in_progress" })
      .mockResolvedValue(SALE);
    document.title = "";
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("lines qr_charge_in_progress")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "read" }));

    await expect.poll(() => document.title).toBe("read sale-1");
    await expect.element(screen.getByText("lines editable")).toBeVisible();
  });

  it("answers unavailable when the core cannot answer a read of the sale", async () => {
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE)
      .mockRejectedValue(new Error("the connection was replaced"));
    document.title = "";
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "read" }));

    await expect.poll(() => document.title).toBe("unavailable");
  });

  it("fails instead of showing the earlier sale when reading it again fails", async () => {
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE)
      .mockRejectedValue(new Error("the connection was replaced"));
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("failed")).toBeVisible();
  });
});

function SearchProbe({ read }: { read: (query: string) => Promise<SearchProductsOutcome> }) {
  const search = useSearchProducts(read);
  return (
    <button
      type="button"
      onClick={() => void search("yerba").then((outcome) => (document.title = outcome.kind))}
    >
      search
    </button>
  );
}

describe("product search", () => {
  it("answers what the core found", async () => {
    const read = vi.fn(async () => ({ kind: "results" as const, products: [], more: false }));
    const screen = await renderWithClient(<SearchProbe read={read} />);

    await userEvent.click(screen.getByRole("button", { name: "search" }));

    await expect.poll(() => document.title).toBe("results");
    expect(read).toHaveBeenCalledWith("yerba");
  });

  it("answers unavailable when the read is rejected", async () => {
    const screen = await renderWithClient(
      <SearchProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "search" }));

    await expect.poll(() => document.title).toBe("unavailable");
  });
});

function CashChargeProbe({
  read,
  saleId = "sale-1",
  pending = 476_000,
  tendered,
}: {
  read: (tendered: number) => Promise<CashChargeAnswer>;
  saleId?: string;
  pending?: number;
  tendered: number | undefined;
}) {
  const charge = useCashChargeQuery({ saleId, pending, tendered, read });
  return <p>{charge.status === "loaded" ? JSON.stringify(charge.value) : charge.status}</p>;
}

describe("cash charge query", () => {
  it.each<[string, CashChargeAnswer]>([
    ["what the sale needs", { kind: "covered", applied: 476_000, change: 24_000 }],
    ["no sale in progress", null],
    ["a refusal to sell", "not_permitted"],
  ])("holds %s as an answer, not a failure", async (_name, answer) => {
    const screen = await renderWithClient(
      <CashChargeProbe read={async () => answer} tendered={500_000} />,
    );

    await expect.element(screen.getByText(JSON.stringify(answer))).toBeVisible();
  });

  it("asks the core with the tendered amount", async () => {
    const read = vi.fn<(tendered: number) => Promise<CashChargeAnswer>>(async () => null);
    const screen = await renderWithClient(<CashChargeProbe read={read} tendered={500_005} />);

    await expect.element(screen.getByText("null")).toBeVisible();
    expect(read).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("does not ask while there is no amount tendered", async () => {
    const read = vi.fn<(tendered: number) => Promise<CashChargeAnswer>>(async () => null);
    const screen = await renderWithClient(<CashChargeProbe read={read} tendered={undefined} />);

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["another amount", "sale-1", 476_000, 400_000],
    ["another sale", "sale-2", 476_000, 500_000],
    ["another pending balance of the sale", "sale-1", 490_000, 500_000],
  ])("never shows the answer given for %s", async (_what, saleId, pending, tendered) => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <CashChargeProbe read={async () => "not_permitted"} tendered={500_000} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText('"not_permitted"')).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <CashChargeProbe
          read={() => new Promise(() => {})}
          saleId={saleId}
          pending={pending}
          tendered={tendered}
        />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <CashChargeProbe
        read={() => Promise.reject(new Error("the connection was replaced"))}
        tendered={500_000}
      />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function standingOf(outcome: ReceiptPrintStatusOutcome): ReceiptPrintStatusOutcome {
  return outcome;
}

function ReceiptPrintStatusProbe({
  saleId = "sale-1",
  read,
}: {
  saleId?: string;
  read: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
}) {
  const status = useReceiptPrintStatusQuery({ saleId, read });
  const refresh = useRefreshReceiptPrintStatus(saleId);
  return (
    <>
      <p>{status.status === "loaded" ? `${status.value.standing ?? "idle"}` : status.status}</p>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </>
  );
}

describe("receipt print status query", () => {
  it("reads the status of the sale it is given and holds what the core found", async () => {
    const read = vi.fn(async () =>
      standingOf({
        kind: "found",
        next_copy: { kind: "original" },
        printed: false,
        standing: "paper_out",
      }),
    );
    const screen = await renderWithClient(<ReceiptPrintStatusProbe read={read} />);

    await expect.element(screen.getByText("paper_out")).toBeVisible();
    expect(read).toHaveBeenCalledWith("sale-1");
  });

  it.each<ReceiptPrintStatusOutcome>([
    { kind: "unavailable" },
    { kind: "not_found" },
    { kind: "not_signed_in" },
  ])("fails when the core answers %j", async (outcome) => {
    const screen = await renderWithClient(<ReceiptPrintStatusProbe read={async () => outcome} />);

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("asks again every second until the receipt is printed, and then stops", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers: ReceiptPrintStatusOutcome[] = [
      { kind: "found", next_copy: { kind: "original" }, printed: false, standing: "printing" },
      { kind: "found", next_copy: { kind: "original" }, printed: true, standing: "printed" },
    ];
    const read = vi.fn(
      async () =>
        answers.shift() ?? {
          kind: "found" as const,
          next_copy: { kind: "original" as const },
          printed: true,
          standing: "printed" as const,
        },
    );
    const screen = await renderWithClient(<ReceiptPrintStatusProbe read={read} />);
    await expect.element(screen.getByText("printing")).toBeVisible();

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(screen.getByText("printed")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops asking once the core answers that the print failed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const read = vi.fn(async () =>
      standingOf({
        kind: "found",
        next_copy: { kind: "original" },
        printed: false,
        standing: "failed",
      }),
    );
    const screen = await renderWithClient(<ReceiptPrintStatusProbe read={read} />);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5000);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again at once when the status is refreshed", async () => {
    const answers: ReceiptPrintStatusOutcome[] = [
      { kind: "found", next_copy: { kind: "original" }, printed: true, standing: "retry_offered" },
      { kind: "found", next_copy: { kind: "original" }, printed: true, standing: "printed" },
    ];
    const read = vi.fn(async () => answers.shift() ?? { kind: "unavailable" as const });
    const screen = await renderWithClient(<ReceiptPrintStatusProbe read={read} />);
    await expect.element(screen.getByText("retry_offered")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("printed")).toBeVisible();
  });
});

type Follow = (paymentTransactionId: string) => Promise<FollowMercadoPagoQrChargeOutcome>;

function followAnswering(...outcomes: FollowMercadoPagoQrChargeOutcome[]) {
  return vi.fn<Follow>(async () => {
    const outcome = outcomes.length > 1 ? outcomes.shift() : outcomes[0];
    return outcome ?? { kind: "unavailable" };
  });
}

function QrChargeProbe({ follow }: { follow: Follow }) {
  const charge = useQrChargeQuery({ paymentTransactionId: "qr-1", follow });
  if (charge.status !== "loaded") {
    return (
      <>
        <p>{charge.status}</p>
        {charge.status === "failed" ? (
          <button type="button" onClick={charge.retry}>
            retry
          </button>
        ) : null}
      </>
    );
  }
  const { value } = charge;
  return <p>{value.kind === "waiting" ? `waiting ${value.remaining_seconds}` : value.kind}</p>;
}

describe("QR charge query", () => {
  it("asks the core about the charge it is given and holds its answer", async () => {
    const follow = followAnswering({ kind: "waiting", remaining_seconds: 161 });
    const screen = await renderWithClient(<QrChargeProbe follow={follow} />);

    await expect.element(screen.getByText("waiting 161")).toBeVisible();
    expect(follow).toHaveBeenCalledWith("qr-1");
  });

  it("asks again every second while the charge waits, and stops once it ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const follow = followAnswering(
      { kind: "waiting", remaining_seconds: 161 },
      { kind: "declined" },
    );
    const screen = await renderWithClient(<QrChargeProbe follow={follow} />);
    await expect.element(screen.getByText("waiting 161")).toBeVisible();

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(screen.getByText("declined")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5000);
    expect(follow).toHaveBeenCalledTimes(2);
  });

  it("fails, asking no more, when the core cannot answer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const follow = followAnswering({ kind: "unavailable" });
    const screen = await renderWithClient(<QrChargeProbe follow={follow} />);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5000);

    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("fails, asking no more, when the core stops answering a charge it was following", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const follow = followAnswering(
      { kind: "waiting", remaining_seconds: 161 },
      { kind: "unavailable" },
    );
    const screen = await renderWithClient(<QrChargeProbe follow={follow} />);
    await expect.element(screen.getByText("waiting 161")).toBeVisible();

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(screen.getByText("failed")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5000);
    expect(follow).toHaveBeenCalledTimes(2);
  });

  it("asks again, starting from loading, when retried after failing", async () => {
    const follow = vi
      .fn<Follow>()
      .mockResolvedValueOnce({ kind: "waiting", remaining_seconds: 161 })
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderWithClient(<QrChargeProbe follow={follow} />);
    await expect.element(screen.getByText("waiting 161")).toBeVisible();
    await vi.advanceTimersByTimeAsync(1000);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(follow).toHaveBeenCalledTimes(3);
  });
});

const HISTORY_FOUND: SalesHistoryOutcome = { kind: "found", rows: [], total: 0, page_size: 50 };

function SalesHistoryProbe({
  page = 1,
  state = "all",
  read,
}: {
  page?: number;
  state?: "all" | "completed";
  read: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
}) {
  const history = useSalesHistoryQuery({ session: "open", state, page, read });
  const refresh = useRefreshSalesHistory();
  return (
    <>
      <p>{history.status === "loaded" ? history.value.kind : history.status}</p>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </>
  );
}

describe("sales history query", () => {
  it("reads the page and filters it is given", async () => {
    const read = vi.fn(async () => HISTORY_FOUND);
    const screen = await renderWithClient(
      <SalesHistoryProbe page={2} state="completed" read={read} />,
    );

    await expect.element(screen.getByText("found")).toBeVisible();
    expect(read).toHaveBeenCalledWith({ session: "open", state: "completed", page: 2 });
  });

  it("holds a refusal to show the history as an answer, not a failure", async () => {
    const screen = await renderWithClient(
      <SalesHistoryProbe read={async () => ({ kind: "lacks_permission" })} />,
    );

    await expect.element(screen.getByText("lacks_permission")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <SalesHistoryProbe read={async () => ({ kind: "unavailable" })} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("reads another page again instead of showing the first one", async () => {
    const queryClient = createQueryClient();
    const read = vi.fn(async () => HISTORY_FOUND);
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <SalesHistoryProbe read={read} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("found")).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <SalesHistoryProbe page={2} read={() => new Promise(() => {})} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("reads the history again when it is refreshed", async () => {
    const read = vi.fn(async () => HISTORY_FOUND);
    const screen = await renderWithClient(<SalesHistoryProbe read={read} />);
    await expect.element(screen.getByText("found")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.poll(() => read.mock.calls.length).toBe(2);
  });
});

function SaleHistoryDetailProbe({
  read,
}: {
  read: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
}) {
  const detail = useSaleHistoryDetailQuery({ saleId: "sale-1", read });
  return <p>{detail.status === "loaded" ? detail.value.kind : detail.status}</p>;
}

describe("sale history detail query", () => {
  it("reads the detail of the sale it is given", async () => {
    const read = vi.fn(async (): Promise<SaleHistoryDetailOutcome> => ({ kind: "not_found" }));
    const screen = await renderWithClient(<SaleHistoryDetailProbe read={read} />);

    await expect.element(screen.getByText("not_found")).toBeVisible();
    expect(read).toHaveBeenCalledWith("sale-1");
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <SaleHistoryDetailProbe read={async () => ({ kind: "unavailable" })} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });
});
