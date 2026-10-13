import { describe, expect, it } from "vitest";
import { killOnFailure } from "./kill-on-failure";

function standInApp(): { readonly app: { process(): { kill(): boolean } }; kills: number } {
  const launched = {
    kills: 0,
    app: {
      process: () => ({
        kill: () => {
          launched.kills += 1;
          return true;
        },
      }),
    },
  };
  return launched;
}

describe("ending a register whose bounded wait failed", () => {
  it("kills the register's process and fails with the wait's error", async () => {
    const launched = standInApp();
    const waitFailure = new Error("the register did not log the line; it logged:\nmain: started");

    await expect(killOnFailure(launched.app, () => Promise.reject(waitFailure))).rejects.toBe(
      waitFailure,
    );
    expect(launched.kills).toBe(1);
  });

  it("leaves the register's process running when the wait ends", async () => {
    const launched = standInApp();

    await killOnFailure(launched.app, () => Promise.resolve());

    expect(launched.kills).toBe(0);
  });
});
