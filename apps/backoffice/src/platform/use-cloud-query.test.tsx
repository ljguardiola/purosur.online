import { useQueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { type CloudData, useCloudQuery } from "./use-cloud-query";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const ok = (value: string): CloudReadOutcome<string> => ({ kind: "ok", value });

function describeData(data: CloudData<string>): string {
  if (data.status === "loading") {
    return "loading";
  }
  if (data.status === "loaded") {
    return `loaded:${data.value}${data.refreshing ? ":refreshing" : ""}`;
  }
  return `failed${data.retryAfterSeconds === undefined ? "" : `:${data.retryAfterSeconds}`}`;
}

type ProbeProps = {
  queryKey?: readonly string[];
  read: () => Promise<CloudReadOutcome<string>>;
  onSessionEnded?: () => void;
  onForbidden?: () => void;
};

function Probe({
  queryKey = ["probe"],
  read,
  onSessionEnded = () => {},
  onForbidden = () => {},
}: ProbeProps) {
  const data = useCloudQuery({ queryKey, read, onSessionEnded, onForbidden });
  const client = useQueryClient();
  return (
    <>
      <p>{describeData(data)}</p>
      <button type="button" onClick={() => void client.invalidateQueries({ queryKey: ["probe"] })}>
        refresh
      </button>
      {data.status === "failed" ? (
        <button type="button" onClick={data.retry}>
          retry
        </button>
      ) : null}
    </>
  );
}

test("shows loading until the read answers, then the value", async () => {
  const answer = deferred<CloudReadOutcome<string>>();

  const screen = await render(<Probe read={() => answer.promise} />);

  await expect.element(screen.getByText("loading")).toBeVisible();
  answer.resolve(ok("one"));
  await expect.element(screen.getByText("loaded:one")).toBeVisible();
});

test("a failed read is reported as failed", async () => {
  const screen = await render(<Probe read={() => Promise.resolve({ kind: "failed" })} />);

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
});

test("a read that throws is reported as failed", async () => {
  const screen = await render(<Probe read={() => Promise.reject(new Error("boom"))} />);

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
});

test("a rate-limited read is reported as failed with the time to wait", async () => {
  const screen = await render(
    <Probe read={() => Promise.resolve({ kind: "rate_limited", retryAfterSeconds: 120 })} />,
  );

  await expect.element(screen.getByText("failed:120")).toBeVisible();
});

test("retrying a failed read goes back to loading and then shows the value", async () => {
  const second = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(second.promise);
  const screen = await render(<Probe read={read} />);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "retry" }));

  await expect.element(screen.getByText("loading")).toBeVisible();
  second.resolve(ok("one"));
  await expect.element(screen.getByText("loaded:one")).toBeVisible();
});

test("refreshing data already shown keeps showing it, marked as refreshing, until the new value arrives", async () => {
  const refresh = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockReturnValueOnce(refresh.promise);
  const screen = await render(<Probe read={read} />);
  await expect.element(screen.getByText("loaded:one")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "refresh" }));

  await expect.element(screen.getByText("loaded:one:refreshing")).toBeVisible();
  refresh.resolve(ok("two"));
  await expect.element(screen.getByText("loaded:two")).toBeVisible();
});

test("a refresh that fails is reported as failed", async () => {
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockResolvedValueOnce({ kind: "failed" });
  const screen = await render(<Probe read={read} />);
  await expect.element(screen.getByText("loaded:one")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "refresh" }));

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
});

test("an older response never replaces a newer one", async () => {
  const firstRefresh = deferred<CloudReadOutcome<string>>();
  const secondRefresh = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockReturnValueOnce(firstRefresh.promise)
    .mockReturnValueOnce(secondRefresh.promise);
  const screen = await render(<Probe read={read} />);
  await expect.element(screen.getByText("loaded:one")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "refresh" }));
  await userEvent.click(screen.getByRole("button", { name: "refresh" }));

  secondRefresh.resolve(ok("newer"));
  await expect.element(screen.getByText("loaded:newer")).toBeVisible();
  firstRefresh.resolve(ok("older"));

  await screen.rerender(<Probe read={read} />);
  await expect.element(screen.getByText("loaded:newer")).toBeVisible();
  await expect.element(screen.getByText("loaded:older")).not.toBeInTheDocument();
});

test("a response for a key that is no longer shown never appears under the current key", async () => {
  const firstKey = deferred<CloudReadOutcome<string>>();
  const secondKey = deferred<CloudReadOutcome<string>>();
  const screen = await render(<Probe queryKey={["probe", "a"]} read={() => firstKey.promise} />);

  await screen.rerender(<Probe queryKey={["probe", "b"]} read={() => secondKey.promise} />);
  secondKey.resolve(ok("for b"));
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();
  firstKey.resolve(ok("for a"));

  await screen.rerender(<Probe queryKey={["probe", "b"]} read={() => secondKey.promise} />);
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();
  await expect.element(screen.getByText("loaded:for a")).not.toBeInTheDocument();
});

test("an unauthenticated read ends the session once, however often the screen renders", async () => {
  const onSessionEnded = vi.fn();
  const read = () => Promise.resolve<CloudReadOutcome<string>>({ kind: "unauthenticated" });
  const screen = await render(<Probe read={read} onSessionEnded={onSessionEnded} />);
  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);

  await screen.rerender(<Probe read={read} onSessionEnded={() => onSessionEnded()} />);
  await screen.rerender(<Probe read={read} onSessionEnded={() => onSessionEnded()} />);

  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("a forbidden read is handed to its forbidden handler", async () => {
  const onForbidden = vi.fn();

  await render(<Probe read={() => Promise.resolve({ kind: "forbidden" })} onForbidden={onForbidden} />);

  await expect.poll(() => onForbidden.mock.calls.length).toBe(1);
});
