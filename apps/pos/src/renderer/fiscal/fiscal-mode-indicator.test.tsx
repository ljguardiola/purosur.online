import { tokenRgb } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { FiscalModeIndicator } from "./fiscal-mode-indicator";

describe("FiscalModeIndicator", () => {
  it("shows the contingency mode in the warning tone while the mode is the offline code", async () => {
    const screen = await render(<FiscalModeIndicator mode="offline_code" />);

    const indicator = screen.getByText("Contingencia CAEA").element();
    expect(getComputedStyle(indicator).backgroundColor).toBe(tokenRgb("warning-subtle"));
  });

  it.each([["real_time"], ["deferring"]] as const)(
    "shows nothing while the mode is %s",
    async (mode) => {
      const screen = await render(<FiscalModeIndicator mode={mode} />);

      expect(screen.container.textContent).toBe("");
    },
  );
});
