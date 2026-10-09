import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import { pinPolicyQueryOptions, usePinPolicyQuery } from "./credentials-queries";

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

function PinPolicyProbe({ read }: { read: () => Promise<{ min_digits: number }> }) {
  return <p>{`${usePinPolicyQuery(read).min_digits} digits`}</p>;
}

function PinPolicyToggle({ read }: { read: () => Promise<{ min_digits: number }> }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown ? <PinPolicyProbe read={read} /> : null}
      <button type="button" onClick={() => setShown(!shown)}>
        toggle
      </button>
    </>
  );
}

describe("credentials queries", () => {
  it("hold the PIN policy", async () => {
    const screen = await renderWithClient(
      <PinPolicyProbe read={async () => ({ min_digits: 6 })} />,
    );

    await expect.element(screen.getByText("6 digits")).toBeVisible();
  });

  it("read the PIN policy once, however long after it is shown again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const read = vi.fn(async () => ({ min_digits: 6 }));
      const screen = await renderWithClient(<PinPolicyToggle read={read} />);
      await expect.element(screen.getByText("6 digits")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "toggle" }));
      await expect.element(screen.getByText("6 digits")).not.toBeInTheDocument();

      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
      await userEvent.click(screen.getByRole("button", { name: "toggle" }));

      await expect.element(screen.getByText("6 digits")).toBeVisible();
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keep a PIN policy read ahead of its screen, however long before the screen shows it", async () => {
    const queryClient = createQueryClient();
    const read = vi.fn(async () => ({ min_digits: 6 }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      await queryClient.ensureQueryData(pinPolicyQueryOptions(read));
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }

    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <PinPolicyProbe read={read} />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("6 digits")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
