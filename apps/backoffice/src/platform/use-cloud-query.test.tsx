import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { createQueryClient } from "./query-client";
import { type CloudData, fetchCloudQuery, useCloudQuery } from "./use-cloud-query";

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
  gcTime?: number;
  refetchInterval?: number;
  keepPreviousData?: boolean;
  read: () => Promise<CloudReadOutcome<string>>;
  onSessionEnded?: () => void;
  onForbidden?: () => void;
};

function Probe({
  queryKey = ["probe"],
  gcTime,
  refetchInterval,
  keepPreviousData,
  read,
  onSessionEnded = () => {},
  onForbidden = () => {},
}: ProbeProps) {
  const data = useCloudQuery({
    queryKey,
    keepPreviousData,
    read,
    onSessionEnded,
    onForbidden,
    ...(gcTime === undefined ? {} : { gcTime }),
    ...(refetchInterval === undefined ? {} : { refetchInterval }),
  });
  const client = useQueryClient();
  return (
    <>
      <p>{describeData(data)}</p>
      {data.status !== "loaded" && "lastValue" in data ? <p>{`last:${data.lastValue}`}</p> : null}
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

test("a key change goes back to loading unless the previous value is kept", async () => {
  const secondKey = deferred<CloudReadOutcome<string>>();
  const screen = await render(
    <Probe queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();

  await screen.rerender(<Probe queryKey={["probe", "b"]} read={() => secondKey.promise} />);

  await expect.element(screen.getByText("loading")).toBeVisible();
});

test("a key change keeps showing the previous value, marked as refreshing, when asked to, until the new key's value arrives", async () => {
  const secondKey = deferred<CloudReadOutcome<string>>();
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();

  await screen.rerender(
    <Probe keepPreviousData queryKey={["probe", "b"]} read={() => secondKey.promise} />,
  );

  await expect.element(screen.getByText("loaded:for a:refreshing")).toBeVisible();
  secondKey.resolve(ok("for b"));
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();
});

test("a key change that fails is reported as failed, not as the previous value, when the previous value is kept", async () => {
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();

  await screen.rerender(
    <Probe
      keepPreviousData
      queryKey={["probe", "b"]}
      read={() => Promise.resolve({ kind: "failed" })}
    />,
  );

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("loaded:for a")).not.toBeInTheDocument();
});

test("a key change that fails carries the last value loaded when the previous value is kept", async () => {
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();

  await screen.rerender(
    <Probe
      keepPreviousData
      queryKey={["probe", "b"]}
      read={() => Promise.resolve({ kind: "failed" })}
    />,
  );

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("last:for a")).toBeVisible();
});

test("retrying a failed key change goes back to loading, carrying the last value loaded, when the previous value is kept", async () => {
  const retried = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retried.promise);
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();
  await screen.rerender(<Probe keepPreviousData queryKey={["probe", "b"]} read={read} />);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "retry" }));

  await expect.element(screen.getByText("loading")).toBeVisible();
  await expect.element(screen.getByText("last:for a")).toBeVisible();
  retried.resolve(ok("for b"));
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();
});

test("reading a failed key again by any means goes back to loading, carrying the last value loaded, when the previous value is kept", async () => {
  const reread = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(reread.promise);
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();
  await screen.rerender(<Probe keepPreviousData queryKey={["probe", "b"]} read={read} />);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "refresh" }));

  await expect.element(screen.getByText("loading")).toBeVisible();
  await expect.element(screen.getByText("last:for a")).toBeVisible();
  reread.resolve(ok("for b"));
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();
});

test("a retry that fails again is reported as failed when the previous value is kept", async () => {
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();
  await screen.rerender(<Probe keepPreviousData queryKey={["probe", "b"]} read={read} />);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "retry" }));

  await expect.poll(() => read.mock.calls.length).toBe(2);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("last:for a")).toBeVisible();
});

test("after a retried key change, changing the key again keeps showing the retried value, marked as refreshing", async () => {
  const thirdKey = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce(ok("for b"));
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();
  await screen.rerender(<Probe keepPreviousData queryKey={["probe", "b"]} read={read} />);
  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "retry" }));
  await expect.element(screen.getByText("loaded:for b")).toBeVisible();

  await screen.rerender(
    <Probe keepPreviousData queryKey={["probe", "c"]} read={() => thirdKey.promise} />,
  );

  await expect.element(screen.getByText("loaded:for b:refreshing")).toBeVisible();
});

test("a failed read carries no last value unless the previous value is kept", async () => {
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockResolvedValueOnce({ kind: "failed" });
  const screen = await render(<Probe read={read} />);
  await expect.element(screen.getByText("loaded:one")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "refresh" }));

  await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("last:one")).not.toBeInTheDocument();
});

test("an older key's response never replaces a newer key's when the previous value is kept", async () => {
  const secondKey = deferred<CloudReadOutcome<string>>();
  const thirdKey = deferred<CloudReadOutcome<string>>();
  const screen = await render(
    <Probe keepPreviousData queryKey={["probe", "a"]} read={() => Promise.resolve(ok("for a"))} />,
  );
  await expect.element(screen.getByText("loaded:for a")).toBeVisible();
  await screen.rerender(
    <Probe keepPreviousData queryKey={["probe", "b"]} read={() => secondKey.promise} />,
  );
  await screen.rerender(
    <Probe keepPreviousData queryKey={["probe", "c"]} read={() => thirdKey.promise} />,
  );

  thirdKey.resolve(ok("for c"));
  await expect.element(screen.getByText("loaded:for c")).toBeVisible();
  secondKey.resolve(ok("for b"));

  await screen.rerender(
    <Probe keepPreviousData queryKey={["probe", "c"]} read={() => thirdKey.promise} />,
  );
  await expect.element(screen.getByText("loaded:for c")).toBeVisible();
  await expect.element(screen.getByText("loaded:for b")).not.toBeInTheDocument();
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

  await render(
    <Probe read={() => Promise.resolve({ kind: "forbidden" })} onForbidden={onForbidden} />,
  );

  await expect.poll(() => onForbidden.mock.calls.length).toBe(1);
});

function ShownOnDemand(props: ProbeProps) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(!shown)}>
        toggle
      </button>
      {shown ? <Probe {...props} /> : null}
    </>
  );
}

test("a refresh refused as forbidden is not handed over again when the screen opens later, and the fresh read decides", async () => {
  const onForbidden = vi.fn();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockResolvedValueOnce({ kind: "forbidden" })
    .mockResolvedValueOnce(ok("two"));
  const screen = await render(<ShownOnDemand read={read} onForbidden={onForbidden} />);
  await expect.element(screen.getByText("loaded:one")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "refresh" }));
  await expect.poll(() => onForbidden.mock.calls.length).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: "toggle" }));

  await userEvent.click(screen.getByRole("button", { name: "toggle" }));

  await expect.element(screen.getByText("loaded:two")).toBeVisible();
  expect(onForbidden).toHaveBeenCalledTimes(1);
});

test("a forbidden read is handed over once and read once, however often the screen renders before it leaves", async () => {
  const onForbidden = vi.fn();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await render(<Probe read={read} onForbidden={onForbidden} />);
  await expect.poll(() => onForbidden.mock.calls.length).toBe(1);

  await screen.rerender(<Probe read={read} onForbidden={() => onForbidden()} />);
  await screen.rerender(<Probe read={read} onForbidden={() => onForbidden()} />);

  expect(read).toHaveBeenCalledTimes(1);
  expect(onForbidden).toHaveBeenCalledTimes(1);
});

function OpenedAfterACachedRead({
  cachedRead,
  ...props
}: ProbeProps & { cachedRead: () => Promise<CloudReadOutcome<string>> }) {
  const client = useQueryClient();
  const [shown, setShown] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => void fetchCloudQuery(client, { queryKey: ["probe"], read: cachedRead })}
      >
        read through the cache
      </button>
      <button type="button" onClick={() => setShown(true)}>
        open
      </button>
      {shown ? <Probe {...props} /> : null}
    </>
  );
}

test("a refusal read through the cache before the screen opened is not handed over, and the screen's own read decides", async () => {
  const onForbidden = vi.fn();
  const cachedRead = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValue({ kind: "forbidden" });
  const answer = deferred<CloudReadOutcome<string>>();
  const screen = await render(
    <OpenedAfterACachedRead
      cachedRead={cachedRead}
      read={() => answer.promise}
      onForbidden={onForbidden}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "read through the cache" }));
  await expect.poll(() => cachedRead.mock.calls.length).toBe(1);

  await userEvent.click(screen.getByRole("button", { name: "open" }));

  await expect.element(screen.getByText("loading")).toBeVisible();
  expect(onForbidden).not.toHaveBeenCalled();
  answer.resolve(ok("one"));
  await expect.element(screen.getByText("loaded:one")).toBeVisible();
  expect(onForbidden).not.toHaveBeenCalled();
});

test("a read through the cache hands back the value it read, and leaves it cached under its key", async () => {
  const client = createQueryClient();

  const outcome = await fetchCloudQuery(client, {
    queryKey: ["probe"],
    read: () => Promise.resolve(ok("one")),
  });

  expect(outcome).toEqual(ok("one"));
  expect(client.getQueryData(["probe"])).toBe("one");
});

test("a read through the cache hands back the refusal of a refused read", async () => {
  const outcome = await fetchCloudQuery(createQueryClient(), {
    queryKey: ["probe"],
    read: () => Promise.resolve<CloudReadOutcome<string>>({ kind: "forbidden" }),
  });

  expect(outcome).toEqual({ kind: "forbidden" });
});

test("a read through the cache that throws is reported as failed", async () => {
  const outcome = await fetchCloudQuery(createQueryClient(), {
    queryKey: ["probe"],
    read: () => Promise.reject(new Error("boom")),
  });

  expect(outcome).toEqual({ kind: "failed" });
});

test("a read through the cache while the same key is already being read sends no second read", async () => {
  const client = createQueryClient();
  const answer = deferred<CloudReadOutcome<string>>();
  const read = vi.fn(() => answer.promise);

  const first = fetchCloudQuery(client, { queryKey: ["probe"], read });
  const second = fetchCloudQuery(client, { queryKey: ["probe"], read });
  answer.resolve(ok("one"));

  expect(await Promise.all([first, second])).toEqual([ok("one"), ok("one")]);
  expect(read).toHaveBeenCalledTimes(1);
});

function Toggle({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(!shown)}>
        toggle
      </button>
      {shown ? children : null}
    </>
  );
}

test("data nobody shows anymore is kept for a later visit by default", async () => {
  const later = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockReturnValueOnce(later.promise);
  const screen = await render(
    <Toggle>
      <Probe read={read} />
    </Toggle>,
  );
  await expect.element(screen.getByText("loaded:one")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "toggle" }));
  await userEvent.click(screen.getByRole("button", { name: "toggle" }));

  await expect.element(screen.getByText("loaded:one:refreshing")).toBeVisible();
});

test("a read that asks for no keeping starts over on a later visit", async () => {
  const later = deferred<CloudReadOutcome<string>>();
  const read = vi
    .fn<() => Promise<CloudReadOutcome<string>>>()
    .mockResolvedValueOnce(ok("one"))
    .mockReturnValueOnce(later.promise);
  const screen = await render(
    <Toggle>
      <Probe read={read} gcTime={0} />
    </Toggle>,
  );
  await expect.element(screen.getByText("loaded:one")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "toggle" }));
  await userEvent.click(screen.getByRole("button", { name: "toggle" }));

  await expect.element(screen.getByText("loading")).toBeVisible();
  later.resolve(ok("two"));
  await expect.element(screen.getByText("loaded:two")).toBeVisible();
});

test("a read through the cache that asks for no keeping leaves nothing cached once nobody shows the key", async () => {
  const client = createQueryClient();

  const outcome = await fetchCloudQuery(client, {
    queryKey: ["probe"],
    read: () => Promise.resolve(ok("one")),
    gcTime: 0,
  });

  expect(outcome).toEqual(ok("one"));
  await vi.waitFor(() => expect(client.getQueryData(["probe"])).toBeUndefined());
});

test("reads again at the interval it is given", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  try {
    const read = vi.fn<() => Promise<CloudReadOutcome<string>>>().mockResolvedValueOnce(ok("one"));
    read.mockResolvedValue(ok("two"));
    const screen = await render(<Probe read={read} refetchInterval={5_000} />);
    await expect.element(screen.getByText("loaded:one")).toBeVisible();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect.element(screen.getByText("loaded:two")).toBeVisible();
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.useRealTimers();
  }
});

test("a read at the interval that fails keeps the value shown and reports nothing else", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  try {
    const read = vi.fn<() => Promise<CloudReadOutcome<string>>>().mockResolvedValueOnce(ok("one"));
    read.mockResolvedValue({ kind: "failed" });
    const onSessionEnded = vi.fn();
    const onForbidden = vi.fn();
    const screen = await render(
      <Probe
        read={read}
        refetchInterval={5_000}
        onSessionEnded={onSessionEnded}
        onForbidden={onForbidden}
      />,
    );
    await expect.element(screen.getByText("loaded:one")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(read).toHaveBeenCalledTimes(2);
    await expect.element(screen.getByText("loaded:one")).toBeVisible();
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(onForbidden).not.toHaveBeenCalled();
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.useRealTimers();
  }
});

test("a read at the interval that finds the session ended or the access refused says so", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  try {
    const read = vi.fn<() => Promise<CloudReadOutcome<string>>>().mockResolvedValueOnce(ok("one"));
    read.mockResolvedValueOnce({ kind: "unauthenticated" });
    read.mockResolvedValue({ kind: "forbidden" });
    const onSessionEnded = vi.fn();
    const onForbidden = vi.fn();
    const screen = await render(
      <Probe
        read={read}
        refetchInterval={5_000}
        onSessionEnded={onSessionEnded}
        onForbidden={onForbidden}
      />,
    );
    await expect.element(screen.getByText("loaded:one")).toBeVisible();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onForbidden).toHaveBeenCalledTimes(1);
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.useRealTimers();
  }
});

async function withIntervalTimers(run: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  try {
    await run();
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.useRealTimers();
  }
}

test("a read at the interval that answers after a newer read landed never replaces it", async () => {
  await withIntervalTimers(async () => {
    const periodic = deferred<CloudReadOutcome<string>>();
    const read = vi
      .fn<() => Promise<CloudReadOutcome<string>>>()
      .mockResolvedValueOnce(ok("one"))
      .mockReturnValueOnce(periodic.promise)
      .mockResolvedValueOnce(ok("saved"));
    const screen = await render(<Probe read={read} refetchInterval={5_000} />);
    await expect.element(screen.getByText("loaded:one")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.element(screen.getByText("loaded:saved")).toBeVisible();

    periodic.resolve(ok("stale"));
    await vi.advanceTimersByTimeAsync(0);

    await expect.element(screen.getByText("loaded:saved")).toBeVisible();
    await expect.element(screen.getByText("loaded:stale")).not.toBeInTheDocument();
  });
});

test("a read at the interval that answers while a newer read is still running never replaces the value shown", async () => {
  await withIntervalTimers(async () => {
    const periodic = deferred<CloudReadOutcome<string>>();
    const newer = deferred<CloudReadOutcome<string>>();
    const read = vi
      .fn<() => Promise<CloudReadOutcome<string>>>()
      .mockResolvedValueOnce(ok("one"))
      .mockReturnValueOnce(periodic.promise)
      .mockReturnValueOnce(newer.promise);
    const screen = await render(<Probe read={read} refetchInterval={5_000} />);
    await expect.element(screen.getByText("loaded:one")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.element(screen.getByText("loaded:one:refreshing")).toBeVisible();

    periodic.resolve(ok("stale"));
    await vi.advanceTimersByTimeAsync(0);

    await expect.element(screen.getByText("loaded:one:refreshing")).toBeVisible();
    newer.resolve(ok("saved"));
    await expect.element(screen.getByText("loaded:saved")).toBeVisible();
  });
});

test("a read at the interval that answers after a read through the cache landed never replaces it", async () => {
  await withIntervalTimers(async () => {
    const periodic = deferred<CloudReadOutcome<string>>();
    const read = vi
      .fn<() => Promise<CloudReadOutcome<string>>>()
      .mockResolvedValueOnce(ok("one"))
      .mockReturnValueOnce(periodic.promise);
    const screen = await render(
      <OpenedAfterACachedRead
        cachedRead={() => Promise.resolve(ok("reloaded"))}
        read={read}
        refetchInterval={5_000}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await expect.element(screen.getByText("loaded:one")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    await userEvent.click(screen.getByRole("button", { name: "read through the cache" }));
    await expect.element(screen.getByText("loaded:reloaded")).toBeVisible();

    periodic.resolve(ok("stale"));
    await vi.advanceTimersByTimeAsync(0);

    await expect.element(screen.getByText("loaded:reloaded")).toBeVisible();
    await expect.element(screen.getByText("loaded:stale")).not.toBeInTheDocument();
  });
});

test("a read at the interval that answers after a newer read failed never replaces the failure", async () => {
  await withIntervalTimers(async () => {
    const periodic = deferred<CloudReadOutcome<string>>();
    const read = vi
      .fn<() => Promise<CloudReadOutcome<string>>>()
      .mockResolvedValueOnce(ok("one"))
      .mockReturnValueOnce(periodic.promise)
      .mockResolvedValueOnce({ kind: "failed" });
    const screen = await render(<Probe read={read} refetchInterval={5_000} />);
    await expect.element(screen.getByText("loaded:one")).toBeVisible();
    await vi.advanceTimersByTimeAsync(5_000);
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();

    periodic.resolve(ok("stale"));
    await vi.advanceTimersByTimeAsync(0);

    await expect.element(screen.getByText("failed", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("loaded:stale")).not.toBeInTheDocument();
  });
});
