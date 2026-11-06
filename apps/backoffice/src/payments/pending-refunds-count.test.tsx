import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { usePendingRefundCounts } from "./pending-refunds-count";
import {
  noPendingRefunds,
  pendingRefunds,
  pendingRefundsWithUnconfirmedCloudRefund,
} from "./test-support/refund-fixtures";

function Probe({
  enabled,
  fetchPendingRefunds,
}: {
  enabled: boolean;
  fetchPendingRefunds: Parameters<typeof usePendingRefundCounts>[0]["fetchPendingRefunds"];
}) {
  const counts = usePendingRefundCounts({ enabled, fetchPendingRefunds, onSessionEnded: () => {} });
  return (
    <p>
      {counts.status === "loaded"
        ? `${counts.value.mercadoPago} to Mercado Pago, ${counts.value.outsideTheSystem} outside`
        : counts.status}
    </p>
  );
}

test("splits the pending refunds into those the cloud sends to Mercado Pago and those made outside the system", async () => {
  const fetchPendingRefunds = vi
    .fn()
    .mockResolvedValue({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund });

  const screen = await render(<Probe enabled fetchPendingRefunds={fetchPendingRefunds} />);

  await expect.element(screen.getByText("1 to Mercado Pago, 1 outside")).toBeInTheDocument();
});

test("counts every pending refund made outside the system when none goes through Mercado Pago", async () => {
  const fetchPendingRefunds = vi.fn().mockResolvedValue({ kind: "ok", value: pendingRefunds });

  const screen = await render(<Probe enabled fetchPendingRefunds={fetchPendingRefunds} />);

  await expect.element(screen.getByText("0 to Mercado Pago, 2 outside")).toBeInTheDocument();
});

test("counts zero of each when no refund is pending", async () => {
  const fetchPendingRefunds = vi.fn().mockResolvedValue({ kind: "ok", value: noPendingRefunds });

  const screen = await render(<Probe enabled fetchPendingRefunds={fetchPendingRefunds} />);

  await expect.element(screen.getByText("0 to Mercado Pago, 0 outside")).toBeInTheDocument();
});

test("asks the cloud for nothing while not enabled", async () => {
  const fetchPendingRefunds = vi.fn().mockResolvedValue({ kind: "ok", value: pendingRefunds });

  const screen = await render(<Probe enabled={false} fetchPendingRefunds={fetchPendingRefunds} />);

  await expect.element(screen.getByText("loading")).toBeInTheDocument();
  expect(fetchPendingRefunds).not.toHaveBeenCalled();
});
