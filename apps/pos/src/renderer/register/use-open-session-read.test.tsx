import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useOpenSessionRead } from "./use-open-session-read";

function Probe({ load }: { load: () => Promise<string | null | "unavailable"> }) {
  const { state, retry, refresh } = useOpenSessionRead(load);
  return (
    <>
      <p>{"value" in state ? `${state.status} ${state.value}` : state.status}</p>
      <button type="button" onClick={retry}>
        retry
      </button>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </>
  );
}

describe("useOpenSessionRead", () => {
  it("loads while the session is read and then holds what it read", async () => {
    const screen = await render(<Probe load={async () => "first"} />);

    await expect.element(screen.getByText("loaded first")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await render(<Probe load={async () => "unavailable"} />);

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("fails when reading throws", async () => {
    const screen = await render(
      <Probe load={() => Promise.reject(new Error("the core connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("keeps loading when there is no open session, until the register leaves the screen", async () => {
    const screen = await render(<Probe load={async () => null} />);

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("reads again from the loading state when retried", async () => {
    const load = vi
      .fn<() => Promise<string | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce("first");
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    await expect.element(screen.getByText("loaded first")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps what it holds while a refresh reads again, then holds the new answer", async () => {
    let answer: (value: string) => void = () => {};
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("loaded first")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.element(screen.getByText("refreshing first")).toBeVisible();
    answer("second");

    await expect.element(screen.getByText("loaded second")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not refresh before the first answer", async () => {
    const load = vi.fn<() => Promise<string>>(() => new Promise(() => {}));
    const screen = await render(<Probe load={load} />);

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(load).toHaveBeenCalledOnce();
  });
});
