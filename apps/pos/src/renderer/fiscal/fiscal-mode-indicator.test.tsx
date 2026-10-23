import { tokenRgb } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { FiscalModeIndicator } from "./fiscal-mode-indicator";

describe("FiscalModeIndicator", () => {
  it("shows the contingency mode in the warning tone while the contingency is the offline code", async () => {
    const screen = await render(
      <FiscalModeIndicator contingency={{ kind: "offline_code", notice: true }} />,
    );

    const indicator = screen.getByText("Contingencia CAEA").element();
    expect(getComputedStyle(indicator).backgroundColor).toBe(tokenRgb("warning-subtle"));
  });

  it.each([[true], [false]])(
    "shows the deferred sale mode in the warning tone while the contingency is deferring and its notice is %s",
    async (notice) => {
      const screen = await render(<FiscalModeIndicator contingency={{ kind: "deferring", notice }} />);

      const indicator = screen.getByText("Venta diferida").element();
      expect(getComputedStyle(indicator).backgroundColor).toBe(tokenRgb("warning-subtle"));
    },
  );

  it("shows nothing while there is no contingency", async () => {
    const screen = await render(<FiscalModeIndicator contingency={null} />);

    expect(screen.container.textContent).toBe("");
  });
});
