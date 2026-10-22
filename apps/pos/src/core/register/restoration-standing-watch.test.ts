import type { RestorationStandingAnswer } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { createRestorationStandingWatch } from "./restoration-standing-watch";

function watchOver(initial: RestorationStandingAnswer) {
  let standing = initial;
  const onChanged = vi.fn();
  const watch = createRestorationStandingWatch({ read: () => standing, onChanged });
  return {
    watch,
    onChanged,
    become(next: RestorationStandingAnswer) {
      standing = next;
    },
  };
}

describe("the restoration standing watch", () => {
  it("says nothing while the standing stays the one it started with", () => {
    const { watch, onChanged } = watchOver({ kind: "in_progress", step: "enroll" });

    watch.check();
    watch.check();

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says so once when the standing moves to another step", () => {
    const { watch, onChanged, become } = watchOver({ kind: "in_progress", step: "enroll" });

    become({ kind: "in_progress", step: "restore" });
    watch.check();
    watch.check();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("says so when the register goes from completed to in progress and back", () => {
    const { watch, onChanged, become } = watchOver({ kind: "completed" });

    become({ kind: "in_progress", step: "enroll" });
    watch.check();
    become({ kind: "completed" });
    watch.check();

    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("starts from the standing it reads when it is built, not from an assumed one", () => {
    const { watch, onChanged } = watchOver({ kind: "in_progress", step: "replenish" });

    watch.check();

    expect(onChanged).not.toHaveBeenCalled();
  });
});
