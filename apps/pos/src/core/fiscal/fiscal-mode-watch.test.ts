import { describe, expect, it, vi } from "vitest";
import { createFiscalModeWatch } from "./fiscal-mode-watch";

function watchOver(initial: "real_time" | "offline_code" | "deferring") {
  let kind = initial;
  const onChanged = vi.fn();
  const watch = createFiscalModeWatch({ read: () => kind, onChanged });
  return {
    watch,
    onChanged,
    become(next: typeof initial) {
      kind = next;
    },
  };
}

describe("the fiscal mode watch", () => {
  it("says nothing while the mode stays the one it started with", () => {
    const { watch, onChanged } = watchOver("real_time");

    watch.check();
    watch.check();

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says so once when the mode changes", () => {
    const { watch, onChanged, become } = watchOver("real_time");

    become("offline_code");
    watch.check();
    watch.check();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("says so again when the mode changes back", () => {
    const { watch, onChanged, become } = watchOver("real_time");

    become("deferring");
    watch.check();
    become("real_time");
    watch.check();

    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("starts from the mode it reads when it is built, not from an assumed one", () => {
    const { watch, onChanged } = watchOver("offline_code");

    watch.check();

    expect(onChanged).not.toHaveBeenCalled();
  });
});
