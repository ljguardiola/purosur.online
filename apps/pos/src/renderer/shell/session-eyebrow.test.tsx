import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { SessionEyebrow } from "./session-eyebrow";

describe("SessionEyebrow", () => {
  it("names the register before saying that no session is open", async () => {
    const screen = await render(<SessionEyebrow registerName="Caja 1" />);

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
  });

  it("only says that no session is open while the register's name isn't known", async () => {
    const screen = await render(<SessionEyebrow registerName={null} />);

    await expect.element(screen.getByText("Sin sesión abierta", { exact: true })).toBeVisible();
  });

  it("shows its text in capitals", async () => {
    const screen = await render(<SessionEyebrow registerName={null} />);

    const style = getComputedStyle(screen.getByText("Sin sesión abierta").element());

    expect(style.textTransform).toBe("uppercase");
  });
});
