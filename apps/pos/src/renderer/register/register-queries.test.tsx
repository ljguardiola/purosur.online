import type {
  CashBalance,
  ListedCashMovement,
  OpenCashSession,
  RecordableCashMovementKinds,
  SessionOpenSale,
} from "@purosur/contracts";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import type { CoreData } from "../platform/use-core-query";
import type { CashSessionState } from "../shell/cash-session-state";
import {
  registerKeys,
  useCashBalanceQuery,
  useCashMovementKindsQuery,
  useCashMovementsQuery,
  useCashSessionQuery,
  useRegisterNameQuery,
  useSessionOpenSaleQuery,
  useSetSessionOpenSale,
} from "./register-queries";

const BALANCE: CashBalance = {
  opening_float: 2_000_000,
  cash_sales: 0,
  change_given: 0,
  refunds: 0,
  cash_in: 0,
  expenses: 0,
  withdrawals: 0,
  expected: 2_000_000,
};

const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  occurred_at: "2026-09-30T12:02:00.000Z",
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};

function describeData<T>(data: CoreData<T>, describeValue: (value: T) => string): string {
  return data.status === "loaded" ? describeValue(data.value) : data.status;
}

type Reads = {
  balance: () => Promise<CashBalance | null | "unavailable">;
  movements: () => Promise<ListedCashMovement[] | null | "unavailable">;
};

function Probe({ balance, movements, sessionId = "s1" }: Reads & { sessionId?: string }) {
  const balanceData = useCashBalanceQuery(sessionId, balance);
  const movementsData = useCashMovementsQuery(sessionId, movements);
  return (
    <>
      <p>{["balance", describeData(balanceData, (value) => String(value.expected))].join(" ")}</p>
      <p>{["movements", describeData(movementsData, (value) => String(value.length))].join(" ")}</p>
    </>
  );
}

function renderProbe(reads: Reads) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe {...reads} />
    </QueryClientProvider>,
  );
}

describe("cash queries", () => {
  it("never show what was read for another session", async () => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <Probe balance={async () => BALANCE} movements={async () => [OPENING]} sessionId="s1" />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("balance 2000000")).toBeVisible();
    await expect.element(screen.getByText("movements 1")).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe
          balance={() => new Promise(() => {})}
          movements={() => new Promise(() => {})}
          sessionId="s2"
        />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("balance loading")).toBeVisible();
    await expect.element(screen.getByText("movements loading")).toBeVisible();
  });

  it("hold the balance and the movements the core answers", async () => {
    const screen = await renderProbe({
      balance: async () => BALANCE,
      movements: async () => [OPENING],
    });

    await expect.element(screen.getByText("balance 2000000")).toBeVisible();
    await expect.element(screen.getByText("movements 1")).toBeVisible();
  });

  it("fail when the core cannot answer", async () => {
    const screen = await renderProbe({
      balance: async () => "unavailable",
      movements: () => Promise.reject(new Error("the connection was replaced")),
    });

    await expect.element(screen.getByText("balance failed")).toBeVisible();
    await expect.element(screen.getByText("movements failed")).toBeVisible();
  });

  it("neither fail nor show data while there is no open session", async () => {
    const balance = vi.fn(async () => null);
    const screen = await renderProbe({ balance, movements: async () => null });

    await expect.poll(() => balance.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("balance loading")).toBeVisible();
    await expect.element(screen.getByText("movements loading")).toBeVisible();
  });
});

const GRACE_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-09-30T12:02:00.000Z",
  opened_by: { user_id: "u2", first_name: "Grace", permission_keys: ["sell_and_charge"] },
};

type CashSessionRead = () => Promise<OpenCashSession | null | "unavailable">;

function CashSessionProbe({
  read,
  enabled = true,
  seen,
}: {
  read: CashSessionRead;
  enabled?: boolean;
  seen: CashSessionState[];
}) {
  const queryClient = useQueryClient();
  const state = useCashSessionQuery({ read, enabled });
  seen.push(state);
  return (
    <>
      <p>{state.status}</p>
      <button
        type="button"
        onClick={() => void queryClient.invalidateQueries({ queryKey: registerKeys.cashSession })}
      >
        reread
      </button>
    </>
  );
}

function renderCashSession(read: CashSessionRead, enabled = true) {
  const seen: CashSessionState[] = [];
  const screen = render(
    <QueryClientProvider client={createQueryClient()}>
      <CashSessionProbe read={read} enabled={enabled} seen={seen} />
    </QueryClientProvider>,
  );
  return { screen, seen };
}

describe("cash session query", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is unknown until the core answers, then tells whether a session is open", async () => {
    const { screen, seen } = renderCashSession(async () => GRACE_SESSION);

    await expect.element((await screen).getByText("open")).toBeVisible();
    expect(seen[0]).toEqual({ status: "unknown" });
    expect(seen.at(-1)).toEqual({
      status: "open",
      id: "s1",
      openedAt: "2026-09-30T12:02:00.000Z",
      openedBy: GRACE_SESSION.opened_by,
    });
  });

  it("says there is no session when the core finds none", async () => {
    const { screen } = renderCashSession(async () => null);

    await expect.element((await screen).getByText("none")).toBeVisible();
  });

  it("says the core is unavailable when it cannot read the session", async () => {
    const { screen } = renderCashSession(async () => "unavailable");

    await expect.element((await screen).getByText("unavailable")).toBeVisible();
  });

  it("stays unknown while the read is rejected", async () => {
    const read = vi.fn<CashSessionRead>(() => Promise.reject(new Error("connection replaced")));
    const { screen } = renderCashSession(read);

    await expect.poll(() => read.mock.calls.length).toBe(1);
    await expect.element((await screen).getByText("unknown")).toBeVisible();
  });

  it("does not read while disabled", async () => {
    const read = vi.fn<CashSessionRead>(async () => null);
    const { screen } = renderCashSession(read, false);

    await expect.element((await screen).getByText("unknown")).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps the same session object when it is read again and nothing changed", async () => {
    const read = vi.fn<CashSessionRead>(async () => structuredClone(GRACE_SESSION));
    const { screen, seen } = renderCashSession(read);
    await expect.element((await screen).getByText("open")).toBeVisible();
    const first = seen.at(-1);

    await userEvent.click((await screen).getByRole("button", { name: "reread" }));
    await expect.poll(() => read.mock.calls.length).toBe(2);

    expect(seen.at(-1)).toBe(first);
  });

  it("reads again every five seconds while the core cannot read it, and stops once it can", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers: ("unavailable" | null)[] = ["unavailable", "unavailable", null];
    const read = vi.fn<CashSessionRead>(async () => answers.shift() ?? null);
    const { screen } = renderCashSession(read);
    await expect.element((await screen).getByText("unavailable")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5000);
    await expect.poll(() => read.mock.calls.length).toBe(2);
    await vi.advanceTimersByTimeAsync(5000);
    await expect.element((await screen).getByText("none")).toBeVisible();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(read).toHaveBeenCalledTimes(3);
  });
});

function RegisterNameProbe({ read }: { read: () => Promise<string | null> }) {
  return <p>{["name", String(useRegisterNameQuery(read))].join(" ")}</p>;
}

function renderRegisterName(read: () => Promise<string | null>) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RegisterNameProbe read={read} />
    </QueryClientProvider>,
  );
}

describe("register name query", () => {
  it("gives the name the core knows", async () => {
    const screen = await renderRegisterName(async () => "Caja 1");

    await expect.element(screen.getByText("name Caja 1")).toBeVisible();
  });

  it("gives no name while the core has none, while it reads, or when reading fails", async () => {
    const none = await renderRegisterName(async () => null);
    await expect.element(none.getByText("name null")).toBeVisible();
    await none.unmount();

    const reading = await renderRegisterName(() => new Promise(() => {}));
    await expect.element(reading.getByText("name null")).toBeVisible();
    await reading.unmount();

    const failing = await renderRegisterName(() => Promise.reject(new Error("replaced")));
    await expect.element(failing.getByText("name null")).toBeVisible();
  });
});

const KINDS: RecordableCashMovementKinds = {
  CASH_IN: { permission: "record_cash_in", authorization_required: false },
  CASH_OUT: { permission: "record_cash_expense", authorization_required: true },
  WITHDRAWAL: { permission: "withdraw_cash", authorization_required: true },
};

type KindsRead = () => Promise<RecordableCashMovementKinds | null | "unavailable">;

function KindsProbe({ read, userId = "u1" }: { read: KindsRead; userId?: string }) {
  const kinds = useCashMovementKindsQuery(userId, read);
  return <p>{describeData(kinds, (value) => value.WITHDRAWAL.permission)}</p>;
}

describe("cash movement kinds query", () => {
  it("holds the kinds the core answers", async () => {
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <KindsProbe read={async () => KINDS} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("withdraw_cash")).toBeVisible();
  });

  it("never shows what was answered for another person", async () => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <KindsProbe read={async () => KINDS} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("withdraw_cash")).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <KindsProbe read={() => new Promise(() => {})} userId="u2" />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <KindsProbe read={async () => "unavailable"} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("neither fails nor shows data while nobody is signed in", async () => {
    const read = vi.fn<KindsRead>(async () => null);
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <KindsProbe read={read} />
      </QueryClientProvider>,
    );

    await expect.poll(() => read.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("loading")).toBeVisible();
  });
});

type OpenSaleRead = () => Promise<SessionOpenSale | null | "unavailable">;

function OpenSaleProbe({ read, answer }: { read: OpenSaleRead; answer: SessionOpenSale | null }) {
  const sale = useSessionOpenSaleQuery("s1", read);
  const setOpenSale = useSetSessionOpenSale("s1");
  return (
    <>
      <p>{["sale", describeData(sale, (value) => JSON.stringify(value))].join(" ")}</p>
      <button type="button" onClick={() => void setOpenSale(answer)}>
        answer
      </button>
    </>
  );
}

describe("open sale query", () => {
  it("holds the open sale the core answers, then the answer set in its place without reading again", async () => {
    const read = vi.fn<OpenSaleRead>(async () => ({ total: 3_434_000, cancellable: true }));
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <OpenSaleProbe read={read} answer={null} />
      </QueryClientProvider>,
    );
    await expect
      .element(screen.getByText('sale {"total":3434000,"cancellable":true}'))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "answer" }));

    await expect.element(screen.getByText("sale null")).toBeVisible();
    expect(read).toHaveBeenCalledOnce();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await render(
      <QueryClientProvider client={createQueryClient()}>
        <OpenSaleProbe read={async () => "unavailable"} answer={null} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("sale failed")).toBeVisible();
  });
});
