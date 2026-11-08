import type { EnrollmentStandingAnswer } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { createInstallationEnrollmentWatch } from "./installation-enrollment-watch";

async function watchOver(initial: EnrollmentStandingAnswer) {
  let standing = initial;
  const onChanged = vi.fn();
  const watch = createInstallationEnrollmentWatch({ read: async () => standing, onChanged });
  await watch.start();
  return {
    watch,
    onChanged,
    become(next: EnrollmentStandingAnswer) {
      standing = next;
    },
  };
}

describe("the installation enrollment watch", () => {
  it("says nothing while the standing stays the one it started with", async () => {
    const { watch, onChanged } = await watchOver({ kind: "enrolled" });

    await watch.check();
    await watch.check();

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says so once when an enrolled installation is revoked", async () => {
    const { watch, onChanged, become } = await watchOver({ kind: "enrolled" });

    become({ kind: "revoked" });
    await watch.check();
    await watch.check();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("says so when a revoked installation is enrolled again", async () => {
    const { watch, onChanged, become } = await watchOver({ kind: "revoked" });

    become({ kind: "enrolled" });
    await watch.check();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("takes the standing it reads on start as the first one, announcing nothing", async () => {
    const { onChanged } = await watchOver({ kind: "not_enrolled" });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
