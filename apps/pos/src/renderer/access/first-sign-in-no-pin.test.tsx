import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, it } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInNoPin } from "./first-sign-in-no-pin";

it("names the person, says they have no PIN yet and offers going back", async () => {
  const screen = await render(<FirstSignInNoPin firstName="Ada" />);

  await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "No tenés PIN todavía" })).toBeVisible();
  const back = screen.getByRole("link", { name: "Volver" });
  expect(back.element().getAttribute("href")).toBe("/sign-in");
  await expectNoAccessibilityViolations(screen.container);
});
