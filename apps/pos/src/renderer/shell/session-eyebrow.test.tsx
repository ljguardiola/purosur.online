import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { SessionEyebrow } from "./session-eyebrow";

describe("SessionEyebrow", () => {
  it("says that no session is open", async () => {
    const screen = await render(<SessionEyebrow />);

    await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
  });

  it("shows its text in capitals", async () => {
    const screen = await render(<SessionEyebrow />);

    const style = getComputedStyle(screen.getByText("Sin sesión abierta").element());

    expect(style.textTransform).toBe("uppercase");
  });
});
