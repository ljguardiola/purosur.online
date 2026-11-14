import type {
  CancelLockedSaleOutcome,
  CashBalance,
  CashCountPreview,
  CloseLockedCashSessionOutcome,
  ListedCashMovement,
  SessionOpenSale,
} from "@purosur/contracts";
import { expect, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../../shell/signed-in-person";
import { render } from "../../shell/test-support/render-with-router";
import type { RefusedClose } from "../close-cash-session-panel";
import { LockedCashCount } from "../locked-cash-count";

export const GRACE: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  abilities: ["open_cash_session"],
};
export const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 3_500_000, direction: "in" },
  change_given: { amount: 930_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 100_000, direction: "in" },
  expenses: { amount: 50_000, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 4_620_000,
};
export const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  direction: "in",
  occurred_at: "2026-09-30T09:02:00.000-03:00",
  actor: { user_id: "u2", first_name: "Grace" },
  authorized_by: null,
};
const CLOSED: CloseLockedCashSessionOutcome = {
  kind: "closed",
  session: {
    id: "s1",
    expected_cash: 4_620_000,
    counted_cash: 4_580_000,
    difference: -40_000,
    opened_at: "2026-09-30T09:02:00.000-03:00",
    closed_at: "2026-09-30T20:14:00.000-03:00",
  },
};

export type Close = (countedCash: number) => Promise<CloseLockedCashSessionOutcome>;
export type CancelSale = (saleId: string) => Promise<CancelLockedSaleOutcome>;
export type LoadOpenSale = () => Promise<SessionOpenSale | null | "unavailable">;
export type LoadCashCountPreview = (
  countedCash: number,
) => Promise<CashCountPreview | null | "unavailable">;

export const CANCELLABLE_SALE: SessionOpenSale = {
  id: "sale-1",
  total: 2_519_250,
  line_count: 4,
  paid: 0,
  has_approved_payment: false,
  cancellable: true,
  cancel_refusal: null,
  refunds_on_cancel: [],
};
export const PART_PAID_SALE: SessionOpenSale = {
  id: "sale-2",
  total: 2_519_250,
  line_count: 4,
  paid: 1_500_000,
  has_approved_payment: true,
  cancellable: false,
  cancel_refusal: null,
  refunds_on_cancel: [
    {
      payment_id: "p1",
      method: "CASH",
      amount: 500_000,
      state: "APPROVED",
      sent_by_cloud: false,
    },
    {
      payment_id: "p2",
      method: "QR",
      amount: 1_000_000,
      state: "PENDING",
      sent_by_cloud: true,
    },
  ],
};
export const OPEN_SALE_NOTICE = "Hay una venta abierta de $ 25.192,50";

export async function renderStep(
  options: {
    close?: Close;
    cancelSale?: CancelSale;
    loadOpenSale?: LoadOpenSale;
    loadCashCountPreview?: LoadCashCountPreview;
    loadCashMovements?: () => Promise<ListedCashMovement[] | null | "unavailable">;
  } = {},
) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const closing = options.close ?? vi.fn<Close>(async () => CLOSED);
  const cancelling =
    options.cancelSale ?? vi.fn<CancelSale>(async () => ({ kind: "cancelled", refunds: [] }));
  const loadOpenSale = options.loadOpenSale ?? vi.fn<LoadOpenSale>(async () => null);
  const refused: RefusedClose[] = [];
  const screen = await render(
    <LockedCashCount
      sessionId="s1"
      opener={GRACE}
      closerName="Sofía"
      loadCashBalance={async () => BALANCE}
      loadCashCountPreview={
        options.loadCashCountPreview ??
        (async (countedCash) => ({ difference: countedCash - BALANCE.expected }))
      }
      loadOpenSale={loadOpenSale}
      loadCashMovements={options.loadCashMovements ?? (async () => [OPENING])}
      close={closing}
      cancelSale={cancelling}
      onRefused={(refusal) => refused.push(refusal)}
    />,
  );
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  return { screen, close: closing, cancelSale: cancelling, loadOpenSale, refused };
}

export function withOpenSale(options: { close?: Close; cancelSale?: CancelSale } = {}) {
  return renderStep({ ...options, loadOpenSale: async () => CANCELLABLE_SALE });
}

export type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

export async function closeWith(screen: Screen, typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Contado" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
