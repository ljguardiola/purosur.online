import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "./query-client";
import type { CoreData } from "./use-core-query";
import { useCoreQuery } from "./use-core-query";

function describeData(data: CoreData<string>): string {
  if (data.status === "loaded") {
    return ["loaded", data.value, data.refreshing ? "refreshing" : ""].join(" ").trim();
  }
  return data.status;
}

function Probe({ read }: { read: () => Promise<string | "unavailable"> }) {
  const data = useCoreQuery({ queryKey: ["probe"], read });
  return (
    <>
      <p>{describeData(data)}</p>
      {data.status === "failed" ? (
        <button type="button" onClick={data.retry}>
          retry
        </button>
      ) : null}
    </>
  );
}

function renderProbe(read: () => Promise<string | "unavailable">) {
  const queryClient = createQueryClient();
  const screen = render(
    <QueryClientProvider client={queryClient}>
      <Probe read={read} />
    </QueryClientProvider>,
  );
  return { screen, queryClient };
}

describe("useCoreQuery", () => {
  it("loads while the core reads and then holds what it answered", async () => {
    const { screen } = renderProbe(async () => "first");

    await expect.element((await screen).getByText("loading")).toBeVisible();
    await expect.element((await screen).getByText("loaded first")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const { screen } = renderProbe(async () => "unavailable");

    await expect.element((await screen).getByText("failed")).toBeVisible();
  });

  it("fails when reading is rejected", async () => {
    const { screen } = renderProbe(() => Promise.reject(new Error("the connection was replaced")));

    await expect.element((await screen).getByText("failed")).toBeVisible();
  });

  it("does not read again by itself after a failure", async () => {
    const read = vi.fn<() => Promise<string | "unavailable">>(async () => "unavailable");
    const { screen } = renderProbe(read);
    await expect.element((await screen).getByText("failed")).toBeVisible();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(read).toHaveBeenCalledOnce();
  });

  it("reads again from the loading state when retried", async () => {
    let answer: (value: string) => void = () => {};
    const read = vi
      .fn<() => Promise<string | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await renderProbe(read).screen;
    await expect.element(screen.getByText("failed")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await expect.element(screen.getByText("loading")).toBeVisible();
    answer("first");

    await expect.element(screen.getByText("loaded first")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps what it holds while an invalidated read runs again, then holds the new answer", async () => {
    let answer: (value: string) => void = () => {};
    const read = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const { screen, queryClient } = renderProbe(read);
    await expect.element((await screen).getByText("loaded first")).toBeVisible();

    void queryClient.invalidateQueries({ queryKey: ["probe"] });
    await expect.element((await screen).getByText("loaded first refreshing")).toBeVisible();
    answer("second");

    await expect.element((await screen).getByText("loaded second")).toBeVisible();
  });
});
